// ---------------------------------------------------------------------------
// Financial reports (Phase 2). Read-only projections over the double-entry
// ledger (financial_movements + the chart of accounts). Nothing here writes.
//
// Sign model (see ledger.ts / accounts.ts): a movement's signed effect is
// credit +, debit −. That is a consistent, UNIVERSAL inversion of standard
// accounting debit/credit (my "credit" = a standard debit, my "debit" = a
// standard credit), so an account's signed balance B = opening + Σ signedDelta
// already equals its standard debit-positive balance:
//   B > 0 → a net debit balance (assets, expenses)
//   B < 0 → a net credit balance (liabilities, equity, income)
// Account openings are stored on the account row (not as movements); the report
// treats each as an opening entry against Opening Balance Equity (code 3900) so
// the sheet always foots.
// ---------------------------------------------------------------------------
import { db, accountsTable, financialMovementsTable, rentChargesTable, tenantsTable } from "@workspace/db";
import { and, asc, eq, gte, lt, lte, ne, sql } from "drizzle-orm";
import { accountNormalBalance } from "@workspace/db";
import { SYSTEM_ACCOUNTS } from "./accounts";

type Exec = typeof db | Parameters<Parameters<typeof db.transaction>[0]>[0];

const round2 = (n: number) => Math.round(n * 100) / 100;

export interface TrialBalanceLine {
  accountId: number;
  code: string | null;
  name: string;
  type: string;
  normalBalance: "debit" | "credit";
  debit: number;   // standard debit column (≥ 0)
  credit: number;  // standard credit column (≥ 0)
}

export interface TrialBalance {
  asOf: string | null;
  lines: TrialBalanceLine[];
  totalDebit: number;
  totalCredit: number;
  balanced: boolean;
}

/**
 * Per-account movement aggregate up to `asOf` (inclusive), in the storage
 * convention: credit = Σ amount of 'credit' movements, debit = Σ 'debit'.
 */
async function movementAggByAccount(exec: Exec, range: { from?: string; to?: string } = {}): Promise<Map<number, { credit: number; debit: number }>> {
  const conds = [eq(financialMovementsTable.status, "posted")];
  if (range.from) conds.push(gte(financialMovementsTable.txnDate, range.from));
  if (range.to) conds.push(lte(financialMovementsTable.txnDate, range.to));
  const rows = await exec
    .select({
      accountId: financialMovementsTable.accountId,
      credit: sql<string>`coalesce(sum(${financialMovementsTable.amountILS}) filter (where ${financialMovementsTable.direction} = 'credit'), 0)`,
      debit: sql<string>`coalesce(sum(${financialMovementsTable.amountILS}) filter (where ${financialMovementsTable.direction} = 'debit'), 0)`,
    })
    .from(financialMovementsTable)
    .where(and(...conds))
    .groupBy(financialMovementsTable.accountId);
  const map = new Map<number, { credit: number; debit: number }>();
  for (const r of rows) map.set(r.accountId, { credit: Number(r.credit), debit: Number(r.debit) });
  return map;
}

/**
 * Standard debit-positive balance of every account = opening (on its normal
 * side) + Σ signedDelta of posted movements. Openings are offset into Opening
 * Balance Equity (3900) so Σ over all accounts is zero. Returns a Map id→balance.
 */
export async function standardBalances(exec: Exec = db, asOf?: string): Promise<Map<number, number>> {
  const accounts = await exec.select().from(accountsTable);
  const agg = await movementAggByAccount(exec, { to: asOf });
  const out = new Map<number, number>();
  let openingOffset = 0;
  let equityId: number | null = null;
  for (const a of accounts) {
    if (a.code === SYSTEM_ACCOUNTS.OPENING_EQUITY) equityId = a.id;
    const m = agg.get(a.id) ?? { credit: 0, debit: 0 };
    const fromMovements = m.credit - m.debit; // std debit-positive
    const nb = accountNormalBalance(a.type);
    const openingContribution = (nb === "debit" ? 1 : -1) * Number(a.openingBalanceILS);
    openingOffset += openingContribution;
    out.set(a.id, round2(fromMovements + openingContribution));
  }
  // Balance the opening entries against Opening Balance Equity so the sheet foots.
  if (equityId != null && Math.abs(openingOffset) >= 0.005) {
    out.set(equityId, round2((out.get(equityId) ?? 0) - openingOffset));
  }
  return out;
}

/** Trial balance: every account's balance split into standard debit/credit columns. */
export async function trialBalance(exec: Exec = db, asOf?: string): Promise<TrialBalance> {
  const accounts = await exec.select().from(accountsTable).orderBy(accountsTable.code, accountsTable.id);
  const balances = await standardBalances(exec, asOf);
  const lines: TrialBalanceLine[] = [];
  let totalDebit = 0, totalCredit = 0;
  for (const a of accounts) {
    const bal = balances.get(a.id) ?? 0;
    const debit = bal > 0 ? bal : 0;
    const credit = bal < 0 ? -bal : 0;
    if (debit === 0 && credit === 0) continue; // omit zero-balance accounts
    totalDebit = round2(totalDebit + debit);
    totalCredit = round2(totalCredit + credit);
    lines.push({
      accountId: a.id, code: a.code, name: a.name, type: a.type,
      normalBalance: accountNormalBalance(a.type), debit, credit,
    });
  }
  return {
    asOf: asOf ?? null,
    lines,
    totalDebit,
    totalCredit,
    balanced: Math.abs(totalDebit - totalCredit) < 0.005,
  };
}

// ─── Income statement ───────────────────────────────────────────────────────

export interface StatementLine {
  accountId: number;
  code: string | null;
  name: string;
  amount: number; // positive figure on the statement (revenue or expense)
}

export interface IncomeStatement {
  from: string | null;
  to: string | null;
  revenue: StatementLine[];
  expenses: StatementLine[];
  totalRevenue: number;
  totalExpenses: number;
  netIncome: number;
}

/**
 * Income statement over [from, to] (inclusive). Revenue = period activity on
 * income accounts (debit − credit, since income accrues on the debit side under
 * the storage convention); expenses = activity on expense accounts (credit −
 * debit). Both presented as positive figures. netIncome = revenue − expenses.
 */
export async function incomeStatement(exec: Exec = db, from?: string, to?: string): Promise<IncomeStatement> {
  const accounts = await exec.select().from(accountsTable).orderBy(accountsTable.code, accountsTable.id);
  const agg = await movementAggByAccount(exec, { from, to });
  const revenue: StatementLine[] = [];
  const expenses: StatementLine[] = [];
  let totalRevenue = 0, totalExpenses = 0;
  for (const a of accounts) {
    const m = agg.get(a.id) ?? { credit: 0, debit: 0 };
    if (a.type === "income") {
      const amount = round2(m.debit - m.credit);
      if (amount === 0) continue;
      revenue.push({ accountId: a.id, code: a.code, name: a.name, amount });
      totalRevenue = round2(totalRevenue + amount);
    } else if (a.type === "expense") {
      const amount = round2(m.credit - m.debit);
      if (amount === 0) continue;
      expenses.push({ accountId: a.id, code: a.code, name: a.name, amount });
      totalExpenses = round2(totalExpenses + amount);
    }
  }
  return {
    from: from ?? null, to: to ?? null,
    revenue, expenses, totalRevenue, totalExpenses,
    netIncome: round2(totalRevenue - totalExpenses),
  };
}

// ─── Balance sheet ──────────────────────────────────────────────────────────

export interface BalanceSheet {
  asOf: string | null;
  assets: StatementLine[];
  liabilities: StatementLine[];
  equity: StatementLine[];
  totalAssets: number;
  totalLiabilities: number;
  totalEquity: number;          // equity accounts only
  netIncome: number;            // current earnings not yet closed to equity
  totalLiabilitiesAndEquity: number;
  balanced: boolean;
}

/**
 * Balance sheet as of a date. Assets carry their standard debit balance (B);
 * liabilities and equity their credit balance (−B), presented positive. Income
 * and expense accounts are folded into a single "current earnings" (net income
 * to date) equity figure since they are not closed to retained earnings until
 * period end. Assets = Liabilities + Equity + net income (identity from the
 * footing trial balance).
 */
export async function balanceSheet(exec: Exec = db, asOf?: string): Promise<BalanceSheet> {
  const accounts = await exec.select().from(accountsTable).orderBy(accountsTable.code, accountsTable.id);
  const balances = await standardBalances(exec, asOf);
  const assets: StatementLine[] = [];
  const liabilities: StatementLine[] = [];
  const equity: StatementLine[] = [];
  let totalAssets = 0, totalLiabilities = 0, totalEquity = 0, netIncome = 0;
  for (const a of accounts) {
    const b = balances.get(a.id) ?? 0;
    if (a.type === "asset") {
      if (b === 0) continue;
      assets.push({ accountId: a.id, code: a.code, name: a.name, amount: b });
      totalAssets = round2(totalAssets + b);
    } else if (a.type === "liability") {
      const amount = round2(-b);
      if (amount === 0) continue;
      liabilities.push({ accountId: a.id, code: a.code, name: a.name, amount });
      totalLiabilities = round2(totalLiabilities + amount);
    } else if (a.type === "equity") {
      const amount = round2(-b);
      if (amount === 0) continue;
      equity.push({ accountId: a.id, code: a.code, name: a.name, amount });
      totalEquity = round2(totalEquity + amount);
    } else {
      // income (b < 0 → revenue) and expense (b > 0) fold into net income = −B.
      netIncome = round2(netIncome - b);
    }
  }
  const totalLiabilitiesAndEquity = round2(totalLiabilities + totalEquity + netIncome);
  return {
    asOf: asOf ?? null,
    assets, liabilities, equity,
    totalAssets, totalLiabilities, totalEquity, netIncome,
    totalLiabilitiesAndEquity,
    balanced: Math.abs(totalAssets - totalLiabilitiesAndEquity) < 0.005,
  };
}

// ─── Account ledger (statement of one account's movements) ───────────────────

export interface AccountLedgerEntry {
  id: number;
  txnDate: string;
  sourceType: string;
  sourceId: number | null;
  entryId: string | null;
  reference: string | null;
  reason: string | null;
  status: string;
  debit: number;   // standard debit column (a 'credit' storage movement)
  credit: number;  // standard credit column (a 'debit' storage movement)
  balance: number; // running standard (debit-positive) balance after this row
}

export interface AccountLedger {
  accountId: number;
  code: string | null;
  name: string;
  type: string;
  from: string | null;
  to: string | null;
  openingBalance: number;  // standard balance before the window
  closingBalance: number;
  entries: AccountLedgerEntry[];
}

/**
 * Statement of a single account: its movements within [from, to] with a running
 * standard (debit-positive) balance. The opening balance carries the account's
 * documented opening plus every movement strictly before `from`, so the running
 * balance is continuous. A storage 'credit' shows in the debit column and a
 * storage 'debit' in the credit column (the universal inversion).
 */
export async function accountLedger(
  exec: Exec = db,
  accountId: number,
  from?: string,
  to?: string,
): Promise<AccountLedger | null> {
  const [acc] = await exec.select().from(accountsTable).where(eq(accountsTable.id, accountId));
  if (!acc) return null;

  // Opening balance = documented opening (on its normal side) + signed sum of
  // everything strictly before the window.
  const nbSign = accountNormalBalance(acc.type) === "debit" ? 1 : -1;
  let opening = nbSign * Number(acc.openingBalanceILS);
  if (from) {
    const [pre] = await exec
      .select({
        credit: sql<string>`coalesce(sum(${financialMovementsTable.amountILS}) filter (where ${financialMovementsTable.direction}='credit'),0)`,
        debit: sql<string>`coalesce(sum(${financialMovementsTable.amountILS}) filter (where ${financialMovementsTable.direction}='debit'),0)`,
      })
      .from(financialMovementsTable)
      .where(and(
        eq(financialMovementsTable.accountId, accountId),
        eq(financialMovementsTable.status, "posted"),
        lt(financialMovementsTable.txnDate, from),
      ));
    opening = round2(opening + Number(pre?.credit ?? 0) - Number(pre?.debit ?? 0));
  } else {
    opening = round2(opening);
  }

  const conds = [eq(financialMovementsTable.accountId, accountId), eq(financialMovementsTable.status, "posted")];
  if (from) conds.push(gte(financialMovementsTable.txnDate, from));
  if (to) conds.push(lte(financialMovementsTable.txnDate, to));
  const rows = await exec
    .select()
    .from(financialMovementsTable)
    .where(and(...conds))
    .orderBy(asc(financialMovementsTable.txnDate), asc(financialMovementsTable.id));

  let balance = opening;
  const entries: AccountLedgerEntry[] = rows.map((m) => {
    const isCredit = m.direction === "credit";
    const amt = Number(m.amountILS);
    balance = round2(balance + (isCredit ? amt : -amt));
    return {
      id: m.id, txnDate: m.txnDate, sourceType: m.sourceType, sourceId: m.sourceId,
      entryId: m.entryId, reference: m.reference, reason: m.reason, status: m.status,
      debit: isCredit ? amt : 0, credit: isCredit ? 0 : amt, balance,
    };
  });

  return {
    accountId: acc.id, code: acc.code, name: acc.name, type: acc.type,
    from: from ?? null, to: to ?? null,
    openingBalance: opening, closingBalance: balance, entries,
  };
}

// ─── Receivables aging ───────────────────────────────────────────────────────

export interface AgingBuckets {
  current: number;   // not yet due (due date on/after asOf)
  d1_30: number;
  d31_60: number;
  d61_90: number;
  d90_plus: number;
  total: number;
}

export interface AgingRow extends AgingBuckets {
  tenantId: number;
  tenantName: string | null;
}

export interface AgingReport {
  asOf: string;
  rows: AgingRow[];
  totals: AgingBuckets;
}

const emptyBuckets = (): AgingBuckets => ({ current: 0, d1_30: 0, d31_60: 0, d61_90: 0, d90_plus: 0, total: 0 });

/**
 * Receivables aging as of a date. Each tenant's outstanding rent charges
 * (amount − allocated, non-cancelled) are bucketed by how overdue they are
 * relative to `asOf` (dueDate): not-yet-due → current, else 1–30 / 31–60 /
 * 61–90 / 90+ days past due. Sourced from rent_charges (the accrual subsystem),
 * which the ledger receivable account mirrors.
 */
export async function agingReport(exec: Exec = db, asOf?: string): Promise<AgingReport> {
  const on = asOf ?? new Date().toISOString().slice(0, 10);
  const age = sql<number>`(${on}::date - ${rentChargesTable.dueDate}::date)`;
  const outstanding = sql`(${rentChargesTable.amountILS} - ${rentChargesTable.allocatedILS})`;
  const bucket = (lo: number | null, hi: number | null) => {
    const conds = [sql`${age} >= ${lo ?? -999999}`];
    if (hi != null) conds.push(sql`${age} <= ${hi}`);
    return sql<string>`coalesce(sum(${outstanding}) filter (where ${sql.join(conds, sql` and `)}), 0)`;
  };
  const rows = await exec
    .select({
      tenantId: rentChargesTable.tenantId,
      tenantName: tenantsTable.name,
      current: sql<string>`coalesce(sum(${outstanding}) filter (where ${age} <= 0), 0)`,
      d1_30: bucket(1, 30),
      d31_60: bucket(31, 60),
      d61_90: bucket(61, 90),
      d90_plus: bucket(91, null),
      total: sql<string>`coalesce(sum(${outstanding}), 0)`,
    })
    .from(rentChargesTable)
    .leftJoin(tenantsTable, eq(tenantsTable.id, rentChargesTable.tenantId))
    .where(and(ne(rentChargesTable.status, "cancelled"), sql`${outstanding} > 0.005`))
    .groupBy(rentChargesTable.tenantId, tenantsTable.name);

  const totals = emptyBuckets();
  const out: AgingRow[] = rows.map((r) => {
    const row: AgingRow = {
      tenantId: r.tenantId, tenantName: r.tenantName ?? null,
      current: round2(Number(r.current)), d1_30: round2(Number(r.d1_30)),
      d31_60: round2(Number(r.d31_60)), d61_90: round2(Number(r.d61_90)),
      d90_plus: round2(Number(r.d90_plus)), total: round2(Number(r.total)),
    };
    totals.current = round2(totals.current + row.current);
    totals.d1_30 = round2(totals.d1_30 + row.d1_30);
    totals.d31_60 = round2(totals.d31_60 + row.d31_60);
    totals.d61_90 = round2(totals.d61_90 + row.d61_90);
    totals.d90_plus = round2(totals.d90_plus + row.d90_plus);
    totals.total = round2(totals.total + row.total);
    return row;
  });
  out.sort((a, b) => b.total - a.total); // largest debtors first
  return { asOf: on, rows: out, totals };
}
