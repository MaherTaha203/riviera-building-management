// ---------------------------------------------------------------------------
// Rent charge → ledger bridge (Phase 2, slice 3). A rent charge is an ACCRUAL:
// when it is generated, the tenant now owes rent and the landlord has earned
// income. That posts a balanced journal entry (Σ signedDelta = 0):
//
//   credit Tenant Receivable (what the tenant owes goes up)   +amount
//   debit  Rent Income       (revenue recognised for the period)
//
// Under the signed convention (credit +, debit −) income accumulates as a
// negative balance; reports present it as positive revenue via the account's
// normal balance. Cash is untouched here — money moves later, on the receipt,
// which credits cash and debits the receivable back down.
//
// A cancelled charge has its entry reversed (clearChargeLedger). Editing a
// charge's amount re-syncs (reverse old, post new) via the same source key.
// ---------------------------------------------------------------------------
import { db } from "@workspace/db";
import { requireSystemAccountId, SYSTEM_ACCOUNTS } from "./accounts";
import { setSourceJournalEffect, type JournalLeg } from "./ledger";

type Exec = typeof db | Parameters<Parameters<typeof db.transaction>[0]>[0];

export interface ChargeLedgerParams {
  chargeId: number;
  tenantId: number;
  amountILS: number | string;
  txnDate: string;          // the charge's due date / period start
  status?: string;          // 'open' | 'settled' | 'cancelled'
  kind?: string;            // 'rent' | 'late_fee' — selects the income account
  createdBy?: number | null;
}

/** Create/edit: post (or re-post) a charge's accrual entry, unless cancelled. */
export async function syncChargeLedger(tx: Exec, p: ChargeLedgerParams): Promise<void> {
  const key = { sourceType: "rent_charge" as const, sourceId: p.chargeId };
  if (p.status === "cancelled") {
    await setSourceJournalEffect(tx, key, null);
    return;
  }
  const amountILS = Number(p.amountILS);
  const party = { relatedPartyType: "tenant", relatedPartyId: p.tenantId };
  const receivableId = await requireSystemAccountId(tx, SYSTEM_ACCOUNTS.RECEIVABLE);
  const incomeId = await requireSystemAccountId(tx, p.kind === "late_fee" ? SYSTEM_ACCOUNTS.LATE_FEE_INCOME : SYSTEM_ACCOUNTS.RENT_INCOME);
  const legs: JournalLeg[] = [
    { accountId: receivableId, direction: "credit", amountILS, ...party },
    { accountId: incomeId, direction: "debit", amountILS, ...party },
  ];
  await setSourceJournalEffect(tx, key, { legs, txnDate: p.txnDate, createdBy: p.createdBy ?? null });
}

/** Cancel/delete: reverse a charge's accrual entry (leaves an audit trail). */
export async function clearChargeLedger(tx: Exec, chargeId: number): Promise<void> {
  await setSourceJournalEffect(tx, { sourceType: "rent_charge", sourceId: chargeId }, null);
}
