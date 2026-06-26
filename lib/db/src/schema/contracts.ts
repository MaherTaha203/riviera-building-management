import { pgTable, text, serial, timestamp, numeric, integer, date, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const contractsTable = pgTable("contracts", {
  id: serial("id").primaryKey(),
  contractNumber: text("contract_number").notNull().unique(),
  tenantId: integer("tenant_id").notNull(),
  unitId: integer("unit_id").notNull(),
  startDate: date("start_date", { mode: "string" }).notNull(),
  endDate: date("end_date", { mode: "string" }).notNull(),
  rentAmount: numeric("rent_amount", { precision: 14, scale: 2 }).notNull(),
  currency: text("currency").notNull().default("ILS"),
  exchangeRate: numeric("exchange_rate", { precision: 10, scale: 4 }).notNull().default("1"),
  rentAmountILS: numeric("rent_amount_ils", { precision: 14, scale: 2 }).notNull(),
  paymentFrequency: text("payment_frequency").notNull().default("monthly"),
  status: text("status").notNull().default("active"),
  notes: text("notes"),
  depositAmount: numeric("deposit_amount", { precision: 14, scale: 2 }),
  paymentCount: integer("payment_count"),
  additionalTerms: text("additional_terms"),
  paymentMethod: text("payment_method"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (t) => [
  // Index the foreign-key columns: every tenant/unit delete checks these for
  // dependents, and list/statement endpoints filter and join on them.
  index("contracts_tenant_id_idx").on(t.tenantId),
  index("contracts_unit_id_idx").on(t.unitId),
]);

export const insertContractSchema = createInsertSchema(contractsTable).omit({ id: true, createdAt: true, updatedAt: true, contractNumber: true });
export type InsertContract = z.infer<typeof insertContractSchema>;
export type Contract = typeof contractsTable.$inferSelect;
