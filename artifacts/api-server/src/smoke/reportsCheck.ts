// Reports smoke (Phase 2, slice 5). Verifies the double-entry reports honour the
// accounting identities: the trial balance foots, revenue flows through to net
// income, and the balance sheet balances (Assets = Liabilities + Equity + net
// income). Self-seeds its chart of accounts so it can run against a freshly
// migrated DB (CI runs migrate, not provision).
//   DATABASE_URL=… tsx src/smoke/reportsCheck.ts
import { db, pool, accountsTable } from "@workspace/db";
import { sql } from "drizzle-orm";
import { syncChargeLedger } from "../lib/chargeLedger";
import { syncVoucherLedger } from "../lib/voucherLedger";
import { trialBalance, incomeStatement, balanceSheet } from "../lib/reports";
import { resolveCashAccountId, SYSTEM_ACCOUNTS } from "../lib/accounts";

async function main() {
  await db.execute(sql`insert into users (id,username,password_hash,name,role) values (1,'chk','x','Chk','admin') on conflict (id) do nothing`);
  // Seed the chart the postings need (idempotent; CI runs migrate, not provision).
  if ((await resolveCashAccountId(db)) == null) {
    await db.insert(accountsTable).values({ kind: "cash", type: "asset", code: SYSTEM_ACCOUNTS.CASH, name: "الصندوق الرئيسي", currency: "ILS", openingBalanceILS: "0", openingSource: "reports smoke" });
  }
  for (const [type, code, name] of [
    ["asset", SYSTEM_ACCOUNTS.RECEIVABLE, "ذمم مدينة — مستأجرون"],
    ["income", SYSTEM_ACCOUNTS.RENT_INCOME, "إيراد الإيجار"],
    ["expense", SYSTEM_ACCOUNTS.EXPENSES, "المصروفات"],
    ["equity", SYSTEM_ACCOUNTS.OPENING_EQUITY, "رصيد افتتاحي"],
  ] as const) {
    await db.execute(sql`insert into accounts (type, code, name, is_system, currency, opening_balance_ils, opening_source) values (${type}, ${code}, ${name}, true, 'ILS', '0', 'reports smoke') on conflict (code) do nothing`);
  }
  // Accrue rent 900, then collect 500 cash.
  await db.transaction((tx) => syncChargeLedger(tx, { chargeId: 1, tenantId: 1, amountILS: 900, txnDate: "2026-03-01", status: "open", createdBy: 1 }));
  await db.transaction((tx) => syncVoucherLedger(tx, { kind: "receipt", voucherId: 1, paymentMethod: "cash", amountILS: 500, txnDate: "2026-03-05", tenantId: 1, createdBy: 1 }));

  const tb = await trialBalance(db);
  const is = await incomeStatement(db, "2026-01-01", "2026-12-31");
  const bs = await balanceSheet(db);
  console.log("Trial balance: debit", tb.totalDebit, "credit", tb.totalCredit, "balanced", tb.balanced);
  console.log("Income statement: revenue", is.totalRevenue, "expenses", is.totalExpenses, "net", is.netIncome);
  console.log("Balance sheet: assets", bs.totalAssets, "L+E+NI", bs.totalLiabilitiesAndEquity, "netIncome", bs.netIncome, "balanced", bs.balanced);

  let fail = 0;
  const chk = (label: string, cond: boolean) => { console.log(`  ${cond ? "✓" : "✗"} ${label}`); if (!cond) fail++; };
  chk("trial balance foots", tb.balanced);
  chk("revenue = 900", Math.abs(is.totalRevenue - 900) < 0.005);
  chk("expenses = 0", Math.abs(is.totalExpenses) < 0.005);
  chk("net income = 900", Math.abs(is.netIncome - 900) < 0.005);
  chk("assets = 500 cash + 400 receivable = 900", Math.abs(bs.totalAssets - 900) < 0.005);
  chk("balance sheet balances", bs.balanced);
  chk("net income folded into equity side = 900", Math.abs(bs.netIncome - 900) < 0.005);
  console.log(fail === 0 ? "\n✓ reports check passed" : `\n✗ reports check failed (${fail})`);
  await pool.end();
  process.exit(fail === 0 ? 0 : 1);
}
main().catch(async (e) => { console.error(e); try { await pool.end(); } catch {} process.exit(1); });
