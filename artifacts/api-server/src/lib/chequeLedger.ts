// ---------------------------------------------------------------------------
// Cheque → ledger bridge (Phase 1, slice 6). Dual-write: a cheque only moves
// money when it CLEARS, so its ledger effect follows the exact same rule the
// bank-balance logic already uses (chequeBankContribution):
//
//   incoming + cleared → credit (money into our account)   +amount
//   outgoing + cleared → debit  (money out of our account) −amount
//   pending / bounced / cancelled → no movement
//
// The movement lands on the unified account that mirrors the cheque's
// settlement bank account (cheque.bankAccountId). A cheque that clears without
// a resolvable settlement account fails the whole transaction — no silent skip
// (freeze P3), matching the bank_transfer voucher rule. Reads still use the
// legacy paths until the cutover slice; this only POPULATES the ledger.
// ---------------------------------------------------------------------------
import { db } from "@workspace/db";
import { resolveBankAccountId, requireSystemAccountId, SYSTEM_ACCOUNTS } from "./accounts";
import { setSourceJournalEffect, type JournalLeg } from "./ledger";
import { chequeBankContribution } from "./bank";

type Exec = typeof db | Parameters<Parameters<typeof db.transaction>[0]>[0];

export interface ChequeLedgerParams {
  chequeId: number;
  type: string;                  // 'incoming' | 'outgoing'
  status: string;                // 'pending' | 'cleared' | 'bounced' | 'cancelled'
  amountILS: number | string;
  bankAccountId?: number | null; // legacy bank_accounts id (our settlement account)
  txnDate: string;               // settlement date (the cheque's due date)
  tenantId?: number | null;
  createdBy?: number | null;
}

/** Create/edit: recompute this cheque's balanced ledger entry and sync it. */
export async function syncChequeLedger(tx: Exec, p: ChequeLedgerParams): Promise<void> {
  const key = { sourceType: "cheque" as const, sourceId: p.chequeId };
  const contribution = chequeBankContribution(p.type, p.status, Number(p.amountILS));
  if (contribution === 0) {
    // Not cleared → no money has moved yet; ensure no ledger effect stands.
    await setSourceJournalEffect(tx, key, null);
    return;
  }
  if (p.bankAccountId == null) {
    throw new Error("ledger: a cleared cheque requires a settlement bank account");
  }
  const bankAccId = await resolveBankAccountId(tx, Number(p.bankAccountId));
  if (bankAccId == null) {
    throw new Error(`ledger: no unified account mirrors bank #${p.bankAccountId}`);
  }
  const amountILS = Math.abs(contribution);
  const party = { relatedPartyType: p.tenantId ? "tenant" : null, relatedPartyId: p.tenantId ?? null };
  // Incoming cleared cheque = money in, settling a receivable; outgoing = money
  // out, funding an expense. Same contra mapping as receipt/payment vouchers.
  const contraId = await requireSystemAccountId(
    tx, contribution > 0 ? SYSTEM_ACCOUNTS.RECEIVABLE : SYSTEM_ACCOUNTS.EXPENSES,
  );
  const legs: JournalLeg[] = contribution > 0
    ? [
        { accountId: bankAccId, direction: "credit", amountILS, ...party },
        { accountId: contraId, direction: "debit", amountILS, ...party },
      ]
    : [
        { accountId: bankAccId, direction: "debit", amountILS, ...party },
        { accountId: contraId, direction: "credit", amountILS, ...party },
      ];
  await setSourceJournalEffect(tx, key, { legs, txnDate: p.txnDate, createdBy: p.createdBy ?? null });
}

/** Delete/cancel: reverse this cheque's ledger effect (leaves an audit trail). */
export async function clearChequeLedger(tx: Exec, chequeId: number): Promise<void> {
  await setSourceJournalEffect(tx, { sourceType: "cheque", sourceId: chequeId }, null);
}
