import { pgTable, serial, timestamp, numeric, integer, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { receiptVouchersTable } from "./receiptVouchers";
import { rentChargesTable } from "./rentCharges";

// Links a tenant receipt to the rent charge(s) it pays. A receipt is allocated
// FIFO (oldest open charge first) up to its amount; the remainder is an
// unallocated credit. Deleting/editing a receipt reverses its allocations.
// Real FKs (RESTRICT) so an allocated charge/receipt can't be orphaned.
export const receiptAllocationsTable = pgTable("receipt_allocations", {
  id: serial("id").primaryKey(),
  receiptVoucherId: integer("receipt_voucher_id").notNull().references(() => receiptVouchersTable.id, { onDelete: "restrict" }),
  rentChargeId: integer("rent_charge_id").notNull().references(() => rentChargesTable.id, { onDelete: "restrict" }),
  amountILS: numeric("amount_ils", { precision: 14, scale: 2 }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index("receipt_allocations_receipt_id_idx").on(t.receiptVoucherId),
  index("receipt_allocations_charge_id_idx").on(t.rentChargeId),
]);

export const insertReceiptAllocationSchema = createInsertSchema(receiptAllocationsTable).omit({ id: true, createdAt: true });
export type InsertReceiptAllocation = z.infer<typeof insertReceiptAllocationSchema>;
export type ReceiptAllocation = typeof receiptAllocationsTable.$inferSelect;
