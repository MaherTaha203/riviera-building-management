// Period-end closing smoke (Phase 2, slice 12). Seeds income + expense activity,
// then posts a closing entry as of a period end and asserts: income/expense are
// zeroed as-of that date, Retained Earnings moves by the net, the trial balance
// still foots, and reversing the closing entry restores income/expense.
// Robust to a shared CI DB: expectations are derived from the closing preview.
//   DATABASE_URL=… tsx src/smoke/closingSmoke.ts
import { db, pool, accountsTable } from "@workspace/db";
import { inArray, sql } from "drizzle-orm";
import { syncChargeLedger } from "../lib/chargeLedger";
import { syncVoucherLedger } from "../lib/voucherLedger";
import { accountBalanceILS } from "../lib/ledger";
import { computeClosing, postClosingEntry, reverseClosingEntry } from "../lib/periodClose";
import { trialBalance } from "../lib/reports";
import { resolveCashAccountId, resolveSystemAccountId, SYSTEM_ACCOUNTS } from "../lib/accounts";

let failures = 0;
const ok = (label: string, cond: boolean, extra = "") => { console.log(`  ${cond ? "✓" : "✗"} ${label}${extra ? ": " + extra : ""}`); if (!cond) failures++; };
const near = (a: number, b: number) => Math.abs(a - b) < 0.005;

async function main() {
  console.log("period-closing smoke\n");
  await db.execute(sql`insert into users (id,username,password_hash,name,role) values (1,'cl','x','CL','admin') on conflict (id) do nothing`);
  if ((await resolveCashAccountId(db)) == null) {
    await db.insert(accountsTable).values({ kind: "cash", type: "asset", code: SYSTEM_ACCOUNTS.CASH, name: "الصندوق الرئيسي", currency: "ILS", openingBalanceILS: "0", openingSource: "cl" });
  }
  for (const [type, code, name] of [
    ["asset", SYSTEM_ACCOUNTS.RECEIVABLE, "ذمم"],
    ["income", SYSTEM_ACCOUNTS.RENT_INCOME, "إيراد الإيجار"],
    ["expense", SYSTEM_ACCOUNTS.EXPENSES, "المصروفات"],
    ["equity", SYSTEM_ACCOUNTS.RETAINED_EARNINGS, "الأرباح المحتجزة"],
  ] as const) {
    await db.execute(sql`insert into accounts (type, code, name, is_system, currency, opening_balance_ils, opening_source) values (${type}, ${code}, ${name}, true, 'ILS', '0', 'cl') on conflict (code) do nothing`);
  }
  const retainedId = (await resolveSystemAccountId(db, SYSTEM_ACCOUNTS.RETAINED_EARNINGS))!;

  const endDate = "2027-06-30";
  // Income (a rent accrual) + expense (a cash payment) within the period.
  await db.transaction((tx) => syncChargeLedger(tx, { chargeId: 77001, tenantId: 1, amountILS: 1200, txnDate: "2027-02-01", status: "open", kind: "rent", createdBy: 1 }));
  await db.transaction((tx) => syncVoucherLedger(tx, { kind: "payment", voucherId: 77002, paymentMethod: "cash", amountILS: 500, txnDate: "2027-03-01", createdBy: 1 }));

  const preview = await computeClosing(db, { id: 9901, endDate });
  ok("preview has an entry", preview.hasEntry);
  ok("preview includes income + expense lines", preview.lines.length >= 2, `${preview.lines.length} lines`);

  const retainedBefore = await accountBalanceILS(db, retainedId, { asOf: endDate });
  await db.transaction((tx) => postClosingEntry(tx, { id: 9901, endDate }, 1));

  // Every income/expense account is zero as of the period end after closing.
  const ieAccounts = await db.select().from(accountsTable).where(inArray(accountsTable.type, ["income", "expense"]));
  let allZero = true;
  for (const a of ieAccounts) { if (!near(await accountBalanceILS(db, a.id, { asOf: endDate }), 0)) allZero = false; }
  ok("income/expense zeroed as of period end", allZero);
  ok("retained earnings moved by the net", near(await accountBalanceILS(db, retainedId, { asOf: endDate }), retainedBefore + preview.retainedEarningsDeltaILS));

  const tb = await trialBalance(db, endDate);
  ok("trial balance still foots after closing", tb.balanced, `${tb.totalDebit}=${tb.totalCredit}`);

  // Reopen: reversing the closing entry restores income/expense as of end date.
  await db.transaction((tx) => reverseClosingEntry(tx, 9901));
  const reopened = await computeClosing(db, { id: 9901, endDate });
  ok("reversal restores income/expense (preview has entry again)", reopened.hasEntry && near(reopened.retainedEarningsDeltaILS, preview.retainedEarningsDeltaILS));

  console.log(failures === 0 ? "\n✓ closing smoke passed" : `\n✗ closing smoke failed (${failures})`);
  await pool.end();
  process.exit(failures === 0 ? 0 : 1);
}
main().catch(async (e) => { console.error("smoke crashed:", e); try { await pool.end(); } catch { /* ignore */ } process.exit(1); });
