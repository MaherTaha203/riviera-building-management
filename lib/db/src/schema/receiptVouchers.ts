import { pgTable, text, serial, timestamp, numeric, integer, date } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const receiptVouchersTable = pgTable("receipt_vouchers", {
  id: serial("id").primaryKey(),
  voucherNumber: text("voucher_number").notNull().unique(),
  date: date("date", { mode: "string" }).notNull(),
  payerName: text("payer_name").notNull(),
  tenantId: integer("tenant_id"),
  contractId: integer("contract_id"),
  amount: numeric("amount", { precision: 14, scale: 2 }).notNull(),
  currency: text("currency").notNull().default("ILS"),
  exchangeRate: numeric("exchange_rate", { precision: 10, scale: 4 }).notNull().default("1"),
  amountILS: numeric("amount_ils", { precision: 14, scale: 2 }).notNull(),
  paymentMethod: text("payment_method").notNull().default("cash"),
  chequeNumber: text("cheque_number"),
  bankName: text("bank_name"),
  chequeDate: date("cheque_date", { mode: "string" }),
  dueDate: date("due_date", { mode: "string" }),
  accountHolderName: text("account_holder_name"),
  previousBalance: numeric("previous_balance", { precision: 14, scale: 2 }),
  newBalance: numeric("new_balance", { precision: 14, scale: 2 }),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertReceiptVoucherSchema = createInsertSchema(receiptVouchersTable).omit({ id: true, createdAt: true, voucherNumber: true });
export type InsertReceiptVoucher = z.infer<typeof insertReceiptVoucherSchema>;
export type ReceiptVoucher = typeof receiptVouchersTable.$inferSelect;
