// ---------------------------------------------------------------------------
// Period-end closing (Phase 2, slice 12). Closing a period posts a balanced
// "closing entry" dated the period's end that zeroes every income/expense
// account's cumulative balance into Retained Earnings (3100). Balance-sheet
// accounts (assets/liabilities/equity) carry forward naturally in the perpetual
// ledger, so they need no entry. Reopening reverses the closing entry.
//
// The closing entry is keyed (sourceType 'closing', sourceId = periodId), so it
// is idempotent and cleanly reversible via setSourceJournalEffect.
// ---------------------------------------------------------------------------
import { db, accountsTable } from "@workspace/db";
import { eq, inArray } from "drizzle-orm";
import { accountBalanceILS, setSourceJournalEffect, type JournalLeg } from "./ledger";
import { requireSystemAccountId, SYSTEM_ACCOUNTS } from "./accounts";

type Exec = typeof db | Parameters<Parameters<typeof db.transaction>[0]>[0];

const round2 = (n: number) => Math.round(n * 100) / 100;

export interface ClosingLine {
  accountId: number;
  code: string | null;
  name: string;
  type: string;
  balanceILS: number;   // signed balance being closed out (credit +, debit −)
}

export interface ClosingPreview {
  periodId: number;
  endDate: string;
  lines: ClosingLine[];
  netIncomeILS: number;             // revenue − expenses over what is being closed
  retainedEarningsDeltaILS: number; // signed change applied to Retained Earnings
  hasEntry: boolean;
}

/**
 * Compute the closing entry for a period as of its end date: every income and
 * expense account with a non-zero cumulative balance, plus the balancing
 * Retained Earnings leg. Pure read.
 */
export async function computeClosing(exec: Exec, period: { id: number; endDate: string }): Promise<ClosingPreview> {
  const accounts = await exec
    .select()
    .from(accountsTable)
    .where(inArray(accountsTable.type, ["income", "expense"]));
  const lines: ClosingLine[] = [];
  let sumSigned = 0; // Σ of income/expense signed balances
  for (const a of accounts) {
    const bal = round2(await accountBalanceILS(exec, a.id, { asOf: period.endDate }));
    if (Math.abs(bal) < 0.005) continue;
    lines.push({ accountId: a.id, code: a.code, name: a.name, type: a.type, balanceILS: bal });
    sumSigned = round2(sumSigned + bal);
  }
  // netIncome = revenue − expenses = −(Σ income+expense signed balances).
  const netIncome = round2(-sumSigned);
  return {
    periodId: period.id, endDate: period.endDate, lines,
    netIncomeILS: netIncome,
    retainedEarningsDeltaILS: sumSigned, // the Retained Earnings leg's signed delta
    hasEntry: lines.length > 0,
  };
}

/**
 * Post (or replace) a period's closing entry. Must run before the period is
 * marked closed (so the entry's own posting isn't blocked by the closed-period
 * rule). Returns the preview that was applied.
 */
export async function postClosingEntry(tx: Exec, period: { id: number; endDate: string }, createdBy?: number | null): Promise<ClosingPreview> {
  const preview = await computeClosing(tx, period);
  const key = { sourceType: "closing" as const, sourceId: period.id };
  if (!preview.hasEntry) {
    await setSourceJournalEffect(tx, key, null); // nothing to close → ensure none stands
    return preview;
  }
  const retainedId = await requireSystemAccountId(tx, SYSTEM_ACCOUNTS.RETAINED_EARNINGS);
  const toLeg = (accountId: number, signedDelta: number): JournalLeg => ({
    accountId,
    direction: signedDelta >= 0 ? "credit" : "debit",
    amountILS: Math.abs(signedDelta),
    reason: "قيد إقفال الفترة",
  });
  // Zero each income/expense account (−balance), then balance into Retained Earnings.
  const legs: JournalLeg[] = preview.lines.map((l) => toLeg(l.accountId, -l.balanceILS));
  legs.push(toLeg(retainedId, preview.retainedEarningsDeltaILS));
  await setSourceJournalEffect(tx, key, { legs, txnDate: period.endDate, createdBy: createdBy ?? null });
  return preview;
}

/** Reverse a period's closing entry (on reopen). Must run after status → open. */
export async function reverseClosingEntry(tx: Exec, periodId: number): Promise<void> {
  await setSourceJournalEffect(tx, { sourceType: "closing", sourceId: periodId }, null);
}
