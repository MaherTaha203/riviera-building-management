// ---------------------------------------------------------------------------
// Bank balance movement (Phase B of the financial-linkage remediation).
//
// A bank_transfer voucher moves money in/out of one of OUR bank accounts. The
// old code matched the account by its free-text name (`where bank_name = …`),
// which silently did nothing when the name didn't match exactly and picked an
// arbitrary row when two accounts shared a name — and, worse, the UI never even
// collected a bank for transfers, so balances never moved at all.
//
// This resolves the account by its id (the new bank_account_id FK), keeping a
// name lookup only as a fallback for legacy rows created before the FK existed.
// All movements are atomic column increments (col = col + delta), safe under
// concurrency, and must be run inside the caller's transaction.
// ---------------------------------------------------------------------------
import { db, bankAccountsTable } from "@workspace/db";
import { eq, sql } from "drizzle-orm";

type TxClient = Parameters<Parameters<typeof db.transaction>[0]>[0];

export interface BankRef {
  bankAccountId?: number | null;
  bankName?: string | null;
}

/**
 * Resolve a voucher's target bank account: the explicit id if present,
 * otherwise a best-effort lookup by name (legacy rows). Returns null when no
 * account can be resolved — the caller then simply moves no balance.
 */
export async function resolveBankAccountId(tx: TxClient, ref: BankRef): Promise<number | null> {
  if (ref.bankAccountId != null) return ref.bankAccountId;
  if (ref.bankName) {
    const [acc] = await tx.select({ id: bankAccountsTable.id }).from(bankAccountsTable).where(eq(bankAccountsTable.bankName, ref.bankName));
    return acc?.id ?? null;
  }
  return null;
}

/**
 * A cheque moves money only when it CLEARS: an incoming cheque is deposited
 * into our account (+), an outgoing one is drawn from it (−). Any other status
 * (pending / bounced / cancelled) contributes nothing. Pure and exhaustively
 * testable; the single source of truth for invariant I2's cheque terms.
 */
export function chequeBankContribution(type: string, status: string, amountILS: number): number {
  if (status !== "cleared") return 0;
  return type === "incoming" ? amountILS : -amountILS;
}

/**
 * Apply a signed ILS delta to a voucher's bank account (positive = money in,
 * negative = money out). No-op when the delta is 0 or no account resolves.
 */
export async function applyBankDelta(tx: TxClient, ref: BankRef, deltaILS: number): Promise<void> {
  if (!deltaILS) return;
  const id = await resolveBankAccountId(tx, ref);
  if (id == null) return;
  await tx
    .update(bankAccountsTable)
    .set({ balanceILS: sql`${bankAccountsTable.balanceILS} + ${deltaILS}` })
    .where(eq(bankAccountsTable.id, id));
}
