// Late-fee automation smoke (Phase 2, slice 9). Seeds an overdue rent charge,
// applies a 10% late fee, and asserts: a late-fee charge is created for the right
// amount, its ledger accrual lands (receivable up, late-fee income recognised),
// tenant amount due includes it, and re-applying is idempotent (0 new).
// Self-seeds its chart so it runs against a freshly migrated DB.
//   DATABASE_URL=… tsx src/smoke/lateFeesSmoke.ts
import { db, pool, accountsTable, tenantsTable, unitsTable, contractsTable, rentChargesTable } from "@workspace/db";
import { sql } from "drizzle-orm";
import { applyLateFees, computeLateFees, tenantAmountDueILS, type LateFeePolicy } from "../lib/receivables";
import { syncChargeLedger } from "../lib/chargeLedger";
import { accountBalanceILS } from "../lib/ledger";
import { resolveCashAccountId, resolveSystemAccountId, SYSTEM_ACCOUNTS } from "../lib/accounts";

let failures = 0;
const ok = (label: string, actual: number, expected: number) => {
  const good = Math.abs(actual - expected) < 0.005;
  console.log(`  ${good ? "✓" : "✗"} ${label}: ${actual} (expect ${expected})`);
  if (!good) failures++;
};

async function main() {
  console.log("late-fees smoke\n");
  await db.execute(sql`insert into users (id,username,password_hash,name,role) values (1,'lf','x','LF','admin') on conflict (id) do nothing`);
  if ((await resolveCashAccountId(db)) == null) {
    await db.insert(accountsTable).values({ kind: "cash", type: "asset", code: SYSTEM_ACCOUNTS.CASH, name: "الصندوق الرئيسي", currency: "ILS", openingBalanceILS: "0", openingSource: "lf" });
  }
  for (const [type, code, name] of [
    ["asset", SYSTEM_ACCOUNTS.RECEIVABLE, "ذمم مدينة"],
    ["income", SYSTEM_ACCOUNTS.RENT_INCOME, "إيراد الإيجار"],
    ["income", SYSTEM_ACCOUNTS.LATE_FEE_INCOME, "إيراد رسوم التأخير"],
  ] as const) {
    await db.execute(sql`insert into accounts (type, code, name, is_system, currency, opening_balance_ils, opening_source) values (${type}, ${code}, ${name}, true, 'ILS', '0', 'lf') on conflict (code) do nothing`);
  }
  const receivableId = (await resolveSystemAccountId(db, SYSTEM_ACCOUNTS.RECEIVABLE))!;
  const lateIncomeId = (await resolveSystemAccountId(db, SYSTEM_ACCOUNTS.LATE_FEE_INCOME))!;

  const [t] = await db.insert(tenantsTable).values({ name: "مستأجر التأخير", phone: "0" }).returning();
  const [u] = await db.insert(unitsTable).values({ unitNumber: "LF-1", type: "apartment", area: "50", floor: "1", status: "occupied" } as typeof unitsTable.$inferInsert).returning();
  const [c] = await db.insert(contractsTable).values({ contractNumber: "LF-C1", tenantId: t.id, unitId: u.id, startDate: "2026-01-01", endDate: "2026-12-31", rentAmount: "1000", currency: "ILS", exchangeRate: "1", rentAmountILS: "1000", paymentFrequency: "monthly", status: "active" }).returning();
  // An overdue rent charge (due 2026-01-01) with its accrual posted.
  const [charge] = await db.insert(rentChargesTable).values({ contractId: c.id, tenantId: t.id, periodStart: "2026-01-01", periodEnd: "2026-01-31", dueDate: "2026-01-01", amountILS: "1000", createdBy: 1 }).returning();
  await db.transaction((tx) => syncChargeLedger(tx, { chargeId: charge.id, tenantId: t.id, amountILS: "1000", txnDate: "2026-01-01", status: "open", kind: "rent", createdBy: 1 }));

  const policy: LateFeePolicy = { enabled: true, graceDays: 10, mode: "percent", rate: 10 };
  const asOf = "2026-03-01";

  const recvBefore = await accountBalanceILS(db, receivableId);
  const lateIncomeBefore = await accountBalanceILS(db, lateIncomeId);

  // Robust to other smokes sharing the DB: derive expectations from the actual
  // candidate set, and assert our own charge is fee'd at 10% of its 1000.
  const candidates = await computeLateFees(db, policy, asOf);
  const mine = candidates.find((c) => c.sourceChargeId === charge.id);
  ok("my overdue charge is a candidate", mine ? 1 : 0, 1);
  ok("fee on my charge = 10% of 1000", mine?.feeILS ?? 0, 100);
  const count = candidates.length;
  const totalFee = candidates.reduce((s, c) => s + c.feeILS, 0);

  const created = await db.transaction(async (tx) => {
    const rows = await applyLateFees(tx, policy, asOf, 1);
    for (const r of rows) await syncChargeLedger(tx, { chargeId: r.id, tenantId: r.tenantId, amountILS: r.amountILS, txnDate: r.dueDate, status: r.status, kind: r.kind, createdBy: 1 });
    return rows;
  });
  ok("late-fee charges created == candidates", created.length, count);
  ok("receivable up by total fees", await accountBalanceILS(db, receivableId), recvBefore + totalFee);
  ok("late-fee income recognised (−total signed)", await accountBalanceILS(db, lateIncomeId), lateIncomeBefore - totalFee);
  ok("my tenant due now 1100", await tenantAmountDueILS(db, t.id), 1100);

  // Idempotent: re-applying creates nothing more.
  const again = await db.transaction((tx) => applyLateFees(tx, policy, asOf, 1));
  ok("re-apply is idempotent (0 new)", again.length, 0);

  // A disabled policy yields no candidates.
  const none = await computeLateFees(db, { ...policy, enabled: false }, asOf);
  ok("disabled policy → no candidates", none.length, 0);

  console.log(failures === 0 ? "\n✓ late-fees smoke passed" : `\n✗ late-fees smoke failed (${failures})`);
  await pool.end();
  process.exit(failures === 0 ? 0 : 1);
}
main().catch(async (e) => { console.error("smoke crashed:", e); try { await pool.end(); } catch { /* ignore */ } process.exit(1); });
