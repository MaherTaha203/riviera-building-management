import { pgTable, text, serial, timestamp, numeric, boolean, date, integer, index, check } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

/**
 * Phase 1 — unified financial accounts (cash + bank), per the ratified
 * Architecture Freeze v1.0 (D3). A single concept for every place money sits;
 * the current balance is a PROJECTION of financial_movements, never mutated
 * directly. ILS is the base currency (D4); `currency` is an informational label
 * only in this phase.
 */
export const accountsTable = pgTable(
  "accounts",
  {
    id: serial("id").primaryKey(),
    kind: text("kind").notNull(), // 'cash' | 'bank'
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
    check("accounts_kind_ck", sql`${t.kind} in ('cash','bank')`),
  ],
);

export const insertAccountSchema = createInsertSchema(accountsTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertAccount = z.infer<typeof insertAccountSchema>;
export type Account = typeof accountsTable.$inferSelect;
