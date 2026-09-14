import { pgTable, text, serial, timestamp, numeric, date, integer, index, uniqueIndex, check, type AnyPgColumn } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { z } from "zod/v4";
import { accountsTable } from "./accounts";
import { financialPeriodsTable } from "./financialPeriods";
import { usersTable } from "./users";

/**
 * Phase 1 — the central financial ledger (Architecture Freeze v1.0, §5).
 * THE single source of truth for money. Every balance is a projection of these
 * rows (opening + Σ posted − Σ reversed). Append-only: posted rows are never
 * mutated or deleted; corrections are reversal rows (reverses_id) so that
 * original + reversal = 0. Amounts are ILS (D4); the original-currency columns
 * are an optional, NON-authoritative memo and are never summed into a balance.
 *
 * Real foreign keys with ON DELETE RESTRICT (D-F1/F19): a movement can never be
 * orphaned, and an account/period/user with movements cannot be deleted.
 */
export const financialMovementsTable = pgTable(
  "financial_movements",
  {
    id: serial("id").primaryKey(),
    // Originating document
    sourceType: text("source_type").notNull(), // receipt|payment|cheque|transfer|rent_charge|adjustment|opening
    sourceId: integer("source_id"), // nullable (e.g. opening)
    // Where it hit
    accountId: integer("account_id").notNull().references(() => accountsTable.id, { onDelete: "restrict" }),
    periodId: integer("period_id").references(() => financialPeriodsTable.id, { onDelete: "restrict" }), // tightened to NOT NULL once periods are populated (later slice)
    txnDate: date("txn_date").notNull(),
    // Money (ILS base)
    amountILS: numeric("amount_ils", { precision: 14, scale: 2 }).notNull(),
    direction: text("direction").notNull(), // 'debit' | 'credit'
    // Optional non-authoritative currency memo (never a second balance)
    originalAmount: numeric("original_amount", { precision: 14, scale: 2 }),
    originalCurrency: text("original_currency"),
    fxRate: numeric("fx_rate", { precision: 10, scale: 4 }),
    // Linkage & lifecycle
    relatedPartyType: text("related_party_type"), // e.g. 'tenant'
    relatedPartyId: integer("related_party_id"),
    reference: text("reference"),
    status: text("status").notNull().default("posted"), // 'posted' | 'reversed'
    reversesId: integer("reverses_id").references((): AnyPgColumn => financialMovementsTable.id, { onDelete: "restrict" }),
    // Double-entry grouping (Phase 2, slice 2): the legs of one balanced journal
    // entry share an entryId; Σ signedDelta over an entryId is always 0. NULL for
    // legacy single-leg postings. A reversal copies its original's entryId, so a
    // fully-reversed entry group still sums to zero.
    entryId: text("entry_id"),
    // Idempotency (F18): a repeated logical operation must not post twice
    idempotencyKey: text("idempotency_key"),
    // Audit
    createdBy: integer("created_by").references(() => usersTable.id, { onDelete: "restrict" }),
    reason: text("reason"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("financial_movements_account_idx").on(t.accountId),
    index("financial_movements_period_idx").on(t.periodId),
    index("financial_movements_source_idx").on(t.sourceType, t.sourceId),
    index("financial_movements_entry_idx").on(t.entryId),
    index("financial_movements_party_idx").on(t.relatedPartyType, t.relatedPartyId),
    uniqueIndex("financial_movements_idempotency_uk").on(t.idempotencyKey), // NULLs allowed & distinct in Postgres
    check("financial_movements_direction_ck", sql`${t.direction} in ('debit','credit')`),
    check("financial_movements_status_ck", sql`${t.status} in ('posted','reversed')`),
    check("financial_movements_amount_ck", sql`${t.amountILS} >= 0`),
  ],
);

export type FinancialMovement = typeof financialMovementsTable.$inferSelect;
export type InsertFinancialMovement = typeof financialMovementsTable.$inferInsert;
export const financialMovementDirection = z.enum(["debit", "credit"]);
export const financialMovementSourceType = z.enum([
  "receipt", "payment", "cheque", "transfer", "rent_charge", "adjustment", "opening", "closing",
]);
