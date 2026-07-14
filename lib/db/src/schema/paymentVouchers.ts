import { pgTable, text, serial, timestamp, numeric, date, integer, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const paymentVouchersTable = pgTable("payment_vouchers", {
  id: serial("id").primaryKey(),
  voucherNumber: text("voucher_number").notNull().unique(),
  date: date("date", { mode: "string" }).notNull(),
  beneficiaryName: text("beneficiary_name").notNull(),
  amount: numeric("amount", { precision: 14, scale: 2 }).notNull(),
  currency: text("currency").notNull().default("ILS"),
  exchangeRate: numeric("exchange_rate", { precision: 10, scale: 4 }).notNull().default("1"),
  amountILS: numeric("amount_ils", { precision: 14, scale: 2 }).notNull(),
  paymentMethod: text("payment_method").notNull().default("cash"),
  category: text("category").notNull(),
  // Phase B — which of OUR bank accounts a bank_transfer draws money from.
  bankAccountId: integer("bank_account_id"),
  chequeNumber: text("cheque_number"),
  bankName: text("bank_name"),
  chequeDate: date("cheque_date", { mode: "string" }),
  dueDate: date("due_date", { mode: "string" }),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  // Bank balance reconciliation (I2) sums vouchers per bank account.
  index("payment_vouchers_bank_account_id_idx").on(t.bankAccountId),
]);

export const insertPaymentVoucherSchema = createInsertSchema(paymentVouchersTable).omit({ id: true, createdAt: true, voucherNumber: true });
export type InsertPaymentVoucher = z.infer<typeof insertPaymentVoucherSchema>;
export type PaymentVoucher = typeof paymentVouchersTable.$inferSelect;
