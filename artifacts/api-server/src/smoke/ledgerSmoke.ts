// ---------------------------------------------------------------------------
// Ledger dual-write smoke (Phase 1, slice 7). Turns the manual verification of
// slices 5 & 6 into an automated, deterministic regression guard: it drives
// receipts, payments and cheques through the real ledger bridges against a live
// Postgres and asserts every projected balance, so a future change that breaks
// direction mapping, account resolution, or reversal is caught in CI.
//
// It uses synthetic source ids (financial_movements.source_id has no FK), so it
// exercises the ledger without needing the legacy voucher/cheque rows. Run it
// against a freshly migrated database; it provisions its own prerequisites
// (a user, a cash account, a bank account) idempotently.
//
//   DATABASE_URL=… tsx src/smoke/ledgerSmoke.ts
// ---------------------------------------------------------------------------
import { db, pool, accountsTable, bankAccountsTable } from "@workspace/db";
import { eq, sql } from "drizzle-orm";
import { accountBalanceILS } from "../lib/ledger";
import { syncVoucherLedger, clearVoucherLedger } from "../lib/voucherLedger";
import { syncChequeLedger, clearChequeLedger } from "../lib/chequeLedger";
import { mirrorBankAccount, resolveCashAccountId } from "../lib/accounts";

const USER = 1;
let failures = 0;

function assertEq(label: string, actual: number, expected: number) {
  const ok = Math.abs(actual - expected) < 0.005;
  console.log(`  ${ok ? "✓" : "✗"} ${label}: ${actual.toFixed(2)} (expect ${expected.toFixed(2)})`);
  if (!ok) failures++;
}

async function ensurePrereqs(): Promise<{ cashAccId: number; bankLegacyId: number }> {
  // A user row for created_by (FK → users.id). Idempotent.
  await db.execute(sql`
    insert into users (id, username, password_hash, name, role)
    values (${USER}, 'smoke', 'x', 'Smoke', 'admin')
    on conflict (id) do nothing
  `);
  // A cash account (the same one provision:accounts would create).
  let cashAccId = await resolveCashAccountId(db);
  if (cashAccId == null) {
    const [cash] = await db.insert(accountsTable).values({
      kind: "cash", name: "الصندوق الرئيسي", currency: "ILS",
      openingBalanceILS: "0", openingDate: "2026-01-01", openingSource: "smoke",
    }).returning();
    cashAccId = cash.id;
  }
  // A legacy bank account + its unified mirror.
  const [bank] = await db.insert(bankAccountsTable).values({
    bankName: "بنك الاختبار", accountNumber: "SMOKE-1", accountName: "جاري", currency: "ILS",
  }).returning();
  await mirrorBankAccount(db, bank);
  return { cashAccId, bankLegacyId: bank.id };
}

async function main() {
  const { cashAccId, bankLegacyId } = await ensurePrereqs();
  const bal = (id: number) => accountBalanceILS(db, id);

  console.log("ledger dual-write smoke\n");

  // --- receipts / payments (slice 5) --------------------------------------
  await db.transaction((tx) => syncVoucherLedger(tx, {
    kind: "receipt", voucherId: 9001, paymentMethod: "cash",
    amountILS: 1000, txnDate: "2026-09-01", createdBy: USER,
  }));
  assertEq("cash after cash receipt 1000", await bal(cashAccId), 1000);

  await db.transaction((tx) => syncVoucherLedger(tx, {
    kind: "receipt", voucherId: 9001, paymentMethod: "cash",
    amountILS: 1500, txnDate: "2026-09-01", createdBy: USER,
  }));
  assertEq("cash after editing that receipt to 1500", await bal(cashAccId), 1500);

  await db.transaction((tx) => syncVoucherLedger(tx, {
    kind: "receipt", voucherId: 9002, paymentMethod: "bank_transfer", bankAccountId: bankLegacyId,
    amountILS: 500, txnDate: "2026-09-02", createdBy: USER,
  }));
  const bankAccId = (await resolveMirror(bankLegacyId));
  assertEq("bank after bank receipt 500", await bal(bankAccId), 500);

  await db.transaction((tx) => syncVoucherLedger(tx, {
    kind: "payment", voucherId: 9003, paymentMethod: "bank_transfer", bankAccountId: bankLegacyId,
    amountILS: 200, txnDate: "2026-09-03", createdBy: USER,
  }));
  assertEq("bank after bank payment 200", await bal(bankAccId), 300);

  await db.transaction((tx) => clearVoucherLedger(tx, "payment", 9003));
  assertEq("bank after deleting the payment", await bal(bankAccId), 500);

  // --- cheques (slice 6) --------------------------------------------------
  await db.transaction((tx) => syncChequeLedger(tx, {
    chequeId: 9101, type: "incoming", status: "cleared", amountILS: 800,
    bankAccountId: bankLegacyId, txnDate: "2026-09-10", createdBy: USER,
  }));
  assertEq("bank after clearing incoming cheque 800", await bal(bankAccId), 1300);

  await db.transaction((tx) => syncChequeLedger(tx, {
    chequeId: 9102, type: "outgoing", status: "cleared", amountILS: 300,
    bankAccountId: bankLegacyId, txnDate: "2026-09-12", createdBy: USER,
  }));
  assertEq("bank after clearing outgoing cheque 300", await bal(bankAccId), 1000);

  await db.transaction((tx) => syncChequeLedger(tx, {
    chequeId: 9102, type: "outgoing", status: "bounced", amountILS: 300,
    bankAccountId: bankLegacyId, txnDate: "2026-09-12", createdBy: USER,
  }));
  assertEq("bank after bouncing that outgoing cheque", await bal(bankAccId), 1300);

  await db.transaction((tx) => clearChequeLedger(tx, 9101));
  assertEq("bank after deleting the incoming cheque", await bal(bankAccId), 500);

  // --- final projections --------------------------------------------------
  console.log("\nfinal projections:");
  assertEq("cash total", await bal(cashAccId), 1500);
  assertEq("bank total", await bal(bankAccId), 500);

  // A cleared bank_transfer that cannot resolve an account must throw (freeze
  // P3: no silent skip), not silently post nothing.
  let threw = false;
  try {
    await db.transaction((tx) => syncVoucherLedger(tx, {
      kind: "receipt", voucherId: 9999, paymentMethod: "bank_transfer", bankAccountId: 999999,
      amountILS: 10, txnDate: "2026-09-01", createdBy: USER,
    }));
  } catch { threw = true; }
  console.log(`  ${threw ? "✓" : "✗"} unresolvable bank_transfer rejects the transaction`);
  if (!threw) failures++;

  console.log(failures === 0 ? "\n✓ ledger smoke passed" : `\n✗ ledger smoke failed (${failures})`);
  await pool.end();
  process.exit(failures === 0 ? 0 : 1);
}

async function resolveMirror(legacyId: number): Promise<number> {
  const [a] = await db.select({ id: accountsTable.id }).from(accountsTable).where(eq(accountsTable.legacyBankAccountId, legacyId));
  if (!a) throw new Error("smoke: bank mirror not found");
  return a.id;
}

main().catch(async (e) => {
  console.error("smoke crashed:", e);
  try { await pool.end(); } catch { /* ignore */ }
  process.exit(1);
});
