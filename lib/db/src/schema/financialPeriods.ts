import { pgTable, text, serial, timestamp, date, integer, index, check } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { usersTable } from "./users";

/**
 * Phase 1 — financial periods (D5). The Closed-Period concept is part of the
 * architecture from day one: once a period is closed, documents posted in it
 * cannot be edited/deleted — corrections go through reversal + a corrective
 * document in an open period. Administrative UI can stay minimal at first.
 */
export const financialPeriodsTable = pgTable(
  "financial_periods",
  {
    id: serial("id").primaryKey(),
    label: text("label").notNull(), // e.g. "2026-09"
    startDate: date("start_date").notNull(),
    endDate: date("end_date").notNull(),
    status: text("status").notNull().default("open"), // 'open' | 'closed'
    closedBy: integer("closed_by").references(() => usersTable.id, { onDelete: "restrict" }),
    closedAt: timestamp("closed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("financial_periods_status_idx").on(t.status),
    check("financial_periods_status_ck", sql`${t.status} in ('open','closed')`),
  ],
);

export const insertFinancialPeriodSchema = createInsertSchema(financialPeriodsTable).omit({ id: true, createdAt: true, closedBy: true, closedAt: true });
export type InsertFinancialPeriod = z.infer<typeof insertFinancialPeriodSchema>;
export type FinancialPeriod = typeof financialPeriodsTable.$inferSelect;
