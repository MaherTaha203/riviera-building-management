import { pgTable, text, serial, timestamp, numeric, integer, date, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { tenantsTable } from "./tenants";
import { bankAccountsTable } from "./bankAccounts";

export const chequesTable = pgTable("cheques", {
  id: serial("id").primaryKey(),
  chequeNumber: text("cheque_number").notNull(),
  type: text("type").notNull(),
  amount: numeric("amount", { precision: 14, scale: 2 }).notNull(),
  currency: text("currency").notNull().default("ILS"),
  exchangeRate: numeric("exchange_rate", { precision: 10, scale: 4 }).notNull().default("1"),
  amountILS: numeric("amount_ils", { precision: 14, scale: 2 }).notNull(),
  bankName: text("bank_name").notNull(),
  chequeDate: date("cheque_date", { mode: "string" }).notNull(),
  dueDate: date("due_date", { mode: "string" }).notNull(),
  status: text("status").notNull().default("pending"),
  drawerName: text("drawer_name").notNull(),
  // Real FK (RESTRICT): a referenced tenant cannot be deleted while cheques point to them.
  tenantId: integer("tenant_id").references(() => tenantsTable.id, { onDelete: "restrict" }),
  // Phase C — which of OUR bank accounts the cheque settles against when it
  // clears: an incoming cheque is deposited into it (+), an outgoing one is
  // drawn from it (−). NB: `bankName` above is the DRAWER's bank, not ours.
  // Real FK (RESTRICT): a referenced bank account cannot be deleted.
  bankAccountId: integer("bank_account_id").references(() => bankAccountsTable.id, { onDelete: "restrict" }),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (t) => [
  // Tenant deletion guard filters cheques by tenant_id.
  index("cheques_tenant_id_idx").on(t.tenantId),
  // Bank balance reconciliation (I2) sums cleared cheques per bank account.
  index("cheques_bank_account_id_idx").on(t.bankAccountId),
]);

export const insertChequeSchema = createInsertSchema(chequesTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertCheque = z.infer<typeof insertChequeSchema>;
export type Cheque = typeof chequesTable.$inferSelect;
