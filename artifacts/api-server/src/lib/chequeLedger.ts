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
import { resolveBankAccountId } from "./accounts";
import { setSourceLedgerEffect } from "./ledger";
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

/** Create/edit: recompute this cheque's single ledger effect and sync it. */
export async function syncChequeLedger(tx: Exec, p: ChequeLedgerParams): Promise<void> {
  const contribution = chequeBankContribution(p.type, p.status, Number(p.amountILS));
  if (contribution === 0) {
    // Not cleared → no money has moved yet; ensure no ledger effect stands.
    await setSourceLedgerEffect(tx, { sourceType: "cheque", sourceId: p.chequeId }, null);
    return;
  }
  if (p.bankAccountId == null) {
    throw new Error("ledger: a cleared cheque requires a settlement bank account");
  }
  const accountId = await resolveBankAccountId(tx, Number(p.bankAccountId));
  if (accountId == null) {
    throw new Error(`ledger: no unified account mirrors bank #${p.bankAccountId}`);
  }
  await setSourceLedgerEffect(tx, { sourceType: "cheque", sourceId: p.chequeId }, {
    accountId,
    direction: contribution > 0 ? "credit" : "debit",
    amountILS: Math.abs(contribution),
    txnDate: p.txnDate,
    relatedPartyType: p.tenantId ? "tenant" : null,
    relatedPartyId: p.tenantId ?? null,
    createdBy: p.createdBy ?? null,
  });
}

/** Delete/cancel: reverse this cheque's ledger effect (leaves an audit trail). */
export async function clearChequeLedger(tx: Exec, chequeId: number): Promise<void> {
  await setSourceLedgerEffect(tx, { sourceType: "cheque", sourceId: chequeId }, null);
}
