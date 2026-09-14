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
import { db, accountsTable, financialMovementsTable } from "@workspace/db";
import { and, eq, lte, sql } from "drizzle-orm";
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
async function movementAggByAccount(exec: Exec, asOf?: string): Promise<Map<number, { credit: number; debit: number }>> {
  const conds = [eq(financialMovementsTable.status, "posted")];
  if (asOf) conds.push(lte(financialMovementsTable.txnDate, asOf));
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
  const agg = await movementAggByAccount(exec, asOf);
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
