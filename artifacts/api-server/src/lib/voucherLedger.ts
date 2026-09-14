// ---------------------------------------------------------------------------
// Voucher → ledger bridge (Phase 1 slice 5; Phase 2 slice 3 = double-entry).
// Dual-write: when a receipt or payment voucher is created / edited / deleted,
// keep its ledger effect in sync alongside the existing balance logic. ILS base
// (D4). Reads use the ledger projection after the cutover; this POPULATES it.
//
// Every voucher now posts a BALANCED journal entry (two legs, Σ signedDelta = 0):
//   receipt → credit cash/bank (money in)  + debit Tenant Receivable (settles what is owed)
//   payment → debit  cash/bank (money out) + credit Expenses (what the money paid for)
//
// The cash/bank leg is unchanged from Phase 1 (same account, direction, amount),
// so cash/bank projections and the legacy reconciliation are unaffected; the new
// contra leg lands on a ledger-only system account and makes the entry balance.
//
// Cash → the main cash account; bank_transfer → the account mirroring the chosen
// bank (must resolve — P3: otherwise the whole voucher transaction fails, never
// a silent skip). cheque → no movement here (money moves when the cheque clears,
// handled by the Cheques module); other → no ledger effect.
// ---------------------------------------------------------------------------
import { db } from "@workspace/db";
import { resolveBankAccountId, resolveCashAccountId, requireSystemAccountId, SYSTEM_ACCOUNTS } from "./accounts";
import { setSourceJournalEffect, type JournalLeg } from "./ledger";

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

/** Create/edit: recompute this voucher's balanced ledger entry and sync it. */
export async function syncVoucherLedger(tx: Exec, p: VoucherLedgerParams): Promise<void> {
  const key = { sourceType: p.kind, sourceId: p.voucherId };
  let moneyAccountId: number | null = null;

  if (p.paymentMethod === "cash") {
    moneyAccountId = await resolveCashAccountId(tx);
    if (moneyAccountId == null) throw new Error("ledger: no cash account provisioned");
  } else if (p.paymentMethod === "bank_transfer") {
    if (p.bankAccountId == null) throw new Error("ledger: bank_transfer voucher requires a bank account");
    moneyAccountId = await resolveBankAccountId(tx, Number(p.bankAccountId));
    if (moneyAccountId == null) throw new Error(`ledger: no unified account mirrors bank #${p.bankAccountId}`);
  } else {
    // cheque (moves at clearing) / other (no account) → this voucher posts nothing.
    await setSourceJournalEffect(tx, key, null);
    return;
  }

  const amountILS = Number(p.amountILS);
  const party = { relatedPartyType: p.tenantId ? "tenant" : null, relatedPartyId: p.tenantId ?? null };
  // Contra: a receipt settles a tenant receivable; a payment funds an expense.
  const contraId = await requireSystemAccountId(
    tx, p.kind === "receipt" ? SYSTEM_ACCOUNTS.RECEIVABLE : SYSTEM_ACCOUNTS.EXPENSES,
  );

  const legs: JournalLeg[] = p.kind === "receipt"
    ? [
        { accountId: moneyAccountId, direction: "credit", amountILS, ...party },
        { accountId: contraId, direction: "debit", amountILS, ...party },
      ]
    : [
        { accountId: moneyAccountId, direction: "debit", amountILS, ...party },
        { accountId: contraId, direction: "credit", amountILS, ...party },
      ];

  await setSourceJournalEffect(tx, key, { legs, txnDate: p.txnDate, createdBy: p.createdBy ?? null });
}

/** Delete/cancel: reverse this voucher's ledger effect (leaves an audit trail). */
export async function clearVoucherLedger(tx: Exec, kind: "receipt" | "payment", voucherId: number): Promise<void> {
  await setSourceJournalEffect(tx, { sourceType: kind, sourceId: voucherId }, null);
}
