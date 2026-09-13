// ---------------------------------------------------------------------------
// Voucher → ledger bridge (Phase 1, slice 5). Dual-write: when a receipt or
// payment voucher is created / edited / deleted, keep its ledger effect in sync
// alongside the existing balance logic. ILS base (D4). Reads still use the
// legacy paths until a later cutover slice; this only POPULATES the ledger.
//
// A movement's direction, from the account's point of view:
//   receipt → credit (money in)      payment → debit (money out)
//
// Cash → the main cash account; bank_transfer → the account mirroring the
// chosen bank (must resolve — P3: otherwise the whole voucher transaction fails,
// never a silent skip). cheque → no movement here (money moves when the cheque
// clears, handled by the Cheques module); other → no ledger account.
// ---------------------------------------------------------------------------
import { db } from "@workspace/db";
import { resolveBankAccountId, resolveCashAccountId } from "./accounts";
import { setSourceLedgerEffect } from "./ledger";

type Exec = typeof db | Parameters<Parameters<typeof db.transaction>[0]>[0];

export interface VoucherLedgerParams {
  kind: "receipt" | "payment";
  voucherId: number;
  paymentMethod: string;
  bankAccountId?: number | null;
  amountILS: number | string;
  txnDate: string;
  tenantId?: number | null;
  createdBy?: number | null;
}

/** Create/edit: recompute this voucher's single ledger effect and sync it. */
export async function syncVoucherLedger(tx: Exec, p: VoucherLedgerParams): Promise<void> {
  const direction = p.kind === "receipt" ? "credit" : "debit";
  let accountId: number | null = null;

  if (p.paymentMethod === "cash") {
    accountId = await resolveCashAccountId(tx);
    if (accountId == null) throw new Error("ledger: no cash account provisioned");
  } else if (p.paymentMethod === "bank_transfer") {
    if (p.bankAccountId == null) throw new Error("ledger: bank_transfer voucher requires a bank account");
    accountId = await resolveBankAccountId(tx, Number(p.bankAccountId));
    if (accountId == null) throw new Error(`ledger: no unified account mirrors bank #${p.bankAccountId}`);
  } else {
    // cheque (moves at clearing) / other (no account) → this voucher posts nothing.
    await setSourceLedgerEffect(tx, { sourceType: p.kind, sourceId: p.voucherId }, null);
    return;
  }

  await setSourceLedgerEffect(tx, { sourceType: p.kind, sourceId: p.voucherId }, {
    accountId,
    direction,
    amountILS: Number(p.amountILS),
    txnDate: p.txnDate,
    relatedPartyType: p.tenantId ? "tenant" : null,
    relatedPartyId: p.tenantId ?? null,
    createdBy: p.createdBy ?? null,
  });
}

/** Delete/cancel: reverse this voucher's ledger effect (leaves an audit trail). */
export async function clearVoucherLedger(tx: Exec, kind: "receipt" | "payment", voucherId: number): Promise<void> {
  await setSourceLedgerEffect(tx, { sourceType: kind, sourceId: voucherId }, null);
}
