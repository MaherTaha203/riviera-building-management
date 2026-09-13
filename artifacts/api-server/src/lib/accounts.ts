// ---------------------------------------------------------------------------
// Accounts bridge (Phase 1, slice 4) — keep the unified `accounts` table in
// sync with the legacy bank_accounts, and resolve the ledger account a voucher
// movement should hit. Transitional: once the legacy table is retired, the
// mirror + legacy lookups go away and callers use accounts directly.
// ---------------------------------------------------------------------------
import { db, accountsTable } from "@workspace/db";
import { and, eq } from "drizzle-orm";

type Exec = typeof db | Parameters<Parameters<typeof db.transaction>[0]>[0];

interface LegacyBank {
  id: number;
  bankName: string;
  accountName: string;
  currency: string;
  balanceILS?: string | number | null;
}

/**
 * Ensure an `accounts` mirror exists for a legacy bank account. Idempotent:
 * returns the existing mirror if one is already linked. New mirrors open at the
 * bank's current balance (a documented opening), so a freshly created bank
 * account (balance 0) opens at 0.
 */
export async function mirrorBankAccount(tx: Exec, bank: LegacyBank) {
  const [existing] = await tx.select().from(accountsTable).where(eq(accountsTable.legacyBankAccountId, bank.id));
  if (existing) return existing;
  const [created] = await tx
    .insert(accountsTable)
    .values({
      kind: "bank",
      name: `${bank.bankName} — ${bank.accountName}`,
      currency: bank.currency,
      openingBalanceILS: bank.balanceILS != null ? String(bank.balanceILS) : "0",
      openingDate: new Date().toISOString().slice(0, 10),
      openingSource: "created with bank account",
      legacyBankAccountId: bank.id,
    })
    .returning();
  return created;
}

/** Resolve the unified account id for a legacy bank_account id (or null). */
export async function resolveBankAccountId(tx: Exec, legacyBankAccountId: number): Promise<number | null> {
  const [a] = await tx.select({ id: accountsTable.id }).from(accountsTable).where(eq(accountsTable.legacyBankAccountId, legacyBankAccountId));
  return a?.id ?? null;
}

/** Resolve the main cash account id (lowest-id active cash account, or null). */
export async function resolveCashAccountId(tx: Exec): Promise<number | null> {
  const [a] = await tx
    .select({ id: accountsTable.id })
    .from(accountsTable)
    .where(and(eq(accountsTable.kind, "cash"), eq(accountsTable.isActive, true)))
    .orderBy(accountsTable.id);
  return a?.id ?? null;
}
