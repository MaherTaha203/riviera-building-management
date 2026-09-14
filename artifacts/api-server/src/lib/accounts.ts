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

/**
 * Fixed codes for the seeded system chart of accounts (Phase 2, slice 1). These
 * are the contra accounts double-entry postings hit. Kept in sync with the
 * SYSTEM_ACCOUNTS seed in scripts/src/provision-accounts.ts.
 */
export const SYSTEM_ACCOUNTS = {
  CASH: "1000",
  RECEIVABLE: "1100",
  PAYABLE: "2000",
  OWNER_EQUITY: "3000",
  RETAINED_EARNINGS: "3100",
  OPENING_EQUITY: "3900",
  RENT_INCOME: "4000",
  LATE_FEE_INCOME: "4100",
  EXPENSES: "5000",
  OTHER_EXPENSES: "5900",
} as const;

/** Resolve a system account id by its fixed code (or null if not provisioned). */
export async function resolveSystemAccountId(tx: Exec, code: string): Promise<number | null> {
  const [a] = await tx.select({ id: accountsTable.id }).from(accountsTable).where(eq(accountsTable.code, code));
  return a?.id ?? null;
}

/**
 * Resolve a system account id by code, throwing a clear error if it is missing.
 * Double-entry postings depend on these contra accounts existing (run
 * provision:accounts), so a missing one is a provisioning fault, not a user error.
 */
export async function requireSystemAccountId(tx: Exec, code: string): Promise<number> {
  const id = await resolveSystemAccountId(tx, code);
  if (id == null) throw new Error(`system account ${code} not provisioned — run provision:accounts`);
  return id;
}
