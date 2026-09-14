import { pgTable, text, serial, timestamp, numeric, integer, date, index, check } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { accountsTable } from "./accounts";
import { usersTable } from "./users";

// An account-to-account transfer (e.g. depositing cash into the bank). It moves
// no money into or out of the building — only between two of our own accounts —
// so in the ledger it is a balanced pair of movements (debit the source, credit
// the destination) that nets to zero. Real FKs, ON DELETE RESTRICT.
export const transfersTable = pgTable("transfers", {
  id: serial("id").primaryKey(),
  fromAccountId: integer("from_account_id").notNull().references(() => accountsTable.id, { onDelete: "restrict" }),
  toAccountId: integer("to_account_id").notNull().references(() => accountsTable.id, { onDelete: "restrict" }),
  amountILS: numeric("amount_ils", { precision: 14, scale: 2 }).notNull(),
  txnDate: date("txn_date", { mode: "string" }).notNull(),
  reference: text("reference"),
  notes: text("notes"),
  createdBy: integer("created_by").references(() => usersTable.id, { onDelete: "restrict" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index("transfers_from_account_id_idx").on(t.fromAccountId),
  index("transfers_to_account_id_idx").on(t.toAccountId),
  check("transfers_distinct_accounts", sql`${t.fromAccountId} <> ${t.toAccountId}`),
  check("transfers_amount_positive", sql`${t.amountILS} > 0`),
]);

export const insertTransferSchema = createInsertSchema(transfersTable).omit({ id: true, createdAt: true });
export type InsertTransfer = z.infer<typeof insertTransferSchema>;
export type Transfer = typeof transfersTable.$inferSelect;
