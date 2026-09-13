import { pgTable, text, serial, timestamp, numeric, integer, date, index, unique } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { contractsTable } from "./contracts";
import { tenantsTable } from "./tenants";
import { usersTable } from "./users";

// A rent charge is a RECEIVABLE (an accrual of what a tenant owes for one rent
// period), not a cash movement — so it lives here, NOT in the cash/bank ledger,
// which stays money-only. A tenant's amount due = Σ (amount − allocated) over
// their open charges. Charges are generated from the contract, one per period
// (freeze D2). Real FKs (RESTRICT) so history is never orphaned.
export const rentChargesTable = pgTable("rent_charges", {
  id: serial("id").primaryKey(),
  contractId: integer("contract_id").notNull().references(() => contractsTable.id, { onDelete: "restrict" }),
  tenantId: integer("tenant_id").notNull().references(() => tenantsTable.id, { onDelete: "restrict" }),
  periodStart: date("period_start", { mode: "string" }).notNull(),
  periodEnd: date("period_end", { mode: "string" }).notNull(),
  dueDate: date("due_date", { mode: "string" }).notNull(),
  amountILS: numeric("amount_ils", { precision: 14, scale: 2 }).notNull(),
  // Kept in sync with Σ receipt_allocations for this charge (fast "amount due").
  allocatedILS: numeric("allocated_ils", { precision: 14, scale: 2 }).notNull().default("0"),
  // open | settled | cancelled. "settled" ⇔ allocated >= amount.
  status: text("status").notNull().default("open"),
  notes: text("notes"),
  createdBy: integer("created_by").references(() => usersTable.id, { onDelete: "restrict" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (t) => [
  // One charge per contract per period — makes generation idempotent.
  unique("rent_charges_contract_period_uq").on(t.contractId, t.periodStart),
  index("rent_charges_tenant_id_idx").on(t.tenantId),
  index("rent_charges_contract_id_idx").on(t.contractId),
]);

export const insertRentChargeSchema = createInsertSchema(rentChargesTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertRentCharge = z.infer<typeof insertRentChargeSchema>;
export type RentCharge = typeof rentChargesTable.$inferSelect;
