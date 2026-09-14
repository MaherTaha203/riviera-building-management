import { pgTable, text, serial, timestamp, numeric, boolean, date, integer, index, check, type AnyPgColumn } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

/**
 * Unified financial accounts. Phase 1 introduced this as a place money sits
 * (cash + bank); Phase 2 (slice 1) promotes it to a full **Chart of Accounts**
 * for double-entry: every account carries an accounting `type`
 * (asset|liability|equity|income|expense), an optional `code`, and an optional
 * `parentId` for hierarchy. Cash/bank accounts keep their `kind`; ledger-only
 * accounts (receivable, income, expense, equity) leave `kind` null.
 *
 * The current balance is a PROJECTION of financial_movements, never mutated
 * directly. ILS is the base currency (D4); `currency` is an informational label.
 *
 * Storage sign convention (unchanged from Phase 1): a movement's signed effect
 * on its account is credit +, debit −, so balance = opening + Σ signedDelta.
 * Reports map that signed balance to conventional debit/credit columns using the
 * account `type`'s normal balance (see accountNormalBalance).
 */
export const accountsTable = pgTable(
  "accounts",
  {
    id: serial("id").primaryKey(),
    // Money-location subtype for cash/bank accounts; null for ledger-only
    // accounts (receivable / income / expense / equity / liability).
    kind: text("kind"), // 'cash' | 'bank' | null
    // Accounting classification (Phase 2). Drives report grouping + normal balance.
    type: text("type").notNull().default("asset"), // asset|liability|equity|income|expense
    // Optional account code (chart-of-accounts numbering, e.g. '1100'). Unique.
    code: text("code").unique(),
    // Optional parent for a hierarchical chart (e.g. banks under a "Banks" node).
    parentId: integer("parent_id").references((): AnyPgColumn => accountsTable.id, { onDelete: "restrict" }),
    // System accounts are seeded (receivable/income/equity/…) and never deleted.
    isSystem: boolean("is_system").notNull().default(false),
    name: text("name").notNull(),
    currency: text("currency").notNull().default("ILS"), // label only; base is ILS
    isActive: boolean("is_active").notNull().default(true),
    openingBalanceILS: numeric("opening_balance_ils", { precision: 14, scale: 2 }).notNull().default("0"),
    openingDate: date("opening_date"),
    openingSource: text("opening_source"),
    // Transitional bridge to the legacy bank_accounts row this account mirrors
    // (Phase 1 migration). Lets vouchers/cheques that still carry a legacy
    // bank_account_id resolve their unified account. Removed once the legacy
    // table is retired. Plain unique integer (no FK to a deprecated table).
    legacyBankAccountId: integer("legacy_bank_account_id").unique(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
  },
  (t) => [
    index("accounts_kind_idx").on(t.kind),
    index("accounts_type_idx").on(t.type),
    check("accounts_kind_ck", sql`${t.kind} is null or ${t.kind} in ('cash','bank')`),
    check("accounts_type_ck", sql`${t.type} in ('asset','liability','equity','income','expense')`),
  ],
);

export const insertAccountSchema = createInsertSchema(accountsTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertAccount = z.infer<typeof insertAccountSchema>;
export type Account = typeof accountsTable.$inferSelect;

/** Accounting account types. */
export const accountType = z.enum(["asset", "liability", "equity", "income", "expense"]);
export type AccountType = z.infer<typeof accountType>;

/**
 * Normal balance side of an account type. Assets and expenses are debit-normal;
 * liabilities, equity and income are credit-normal. Reports use this to present
 * the signed ledger balance as a positive figure on the correct side.
 */
export function accountNormalBalance(type: string): "debit" | "credit" {
  return type === "asset" || type === "expense" ? "debit" : "credit";
}
