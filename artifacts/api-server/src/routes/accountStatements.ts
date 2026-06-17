import { Router } from "express";
import { db, receiptVouchersTable, paymentVouchersTable, tenantsTable } from "@workspace/db";
import { eq, gte, lte, and, type SQL } from "drizzle-orm";
import { authMiddleware } from "../lib/auth";

const router = Router();

router.get("/account-statements", authMiddleware, async (req, res): Promise<void> => {
  const tenantId = req.query.tenantId ? parseInt(req.query.tenantId as string, 10) : null;
  const contractId = req.query.contractId ? parseInt(req.query.contractId as string, 10) : null;
  const from = req.query.from as string | undefined;
  const to = req.query.to as string | undefined;

  // Receipt vouchers (credit entries)
  const receiptConds: SQL[] = [];
  if (tenantId) receiptConds.push(eq(receiptVouchersTable.tenantId, tenantId));
  if (contractId) receiptConds.push(eq(receiptVouchersTable.contractId, contractId));
  if (from) receiptConds.push(gte(receiptVouchersTable.date, from));
  if (to) receiptConds.push(lte(receiptVouchersTable.date, to));

  const receipts = await db
    .select()
    .from(receiptVouchersTable)
    .where(receiptConds.length > 0 ? and(...receiptConds) : undefined)
    .orderBy(receiptVouchersTable.date, receiptVouchersTable.id);

  type RowEntry = {
    date: string;
    credit: number;
    debit: number;
    description: string;
    referenceType: string;
    referenceId: number;
  };
  const rows: RowEntry[] = receipts.map((v) => ({
    date: v.date,
    credit: Number(v.amountILS),
    debit: 0,
    description: `${v.voucherNumber} - ${v.payerName}`,
    referenceType: "receipt_voucher",
    referenceId: v.id,
  }));

  // Payment vouchers (debit entries) — only included in general (non-tenant, non-contract) view
  if (!tenantId && !contractId) {
    const paymentConds: SQL[] = [];
    if (from) paymentConds.push(gte(paymentVouchersTable.date, from));
    if (to) paymentConds.push(lte(paymentVouchersTable.date, to));

    const payments = await db
      .select()
      .from(paymentVouchersTable)
      .where(paymentConds.length > 0 ? and(...paymentConds) : undefined)
      .orderBy(paymentVouchersTable.date, paymentVouchersTable.id);

    for (const v of payments) {
      rows.push({
        date: v.date,
        debit: Number(v.amountILS),
        credit: 0,
        description: `${v.voucherNumber} - ${v.beneficiaryName}`,
        referenceType: "payment_voucher",
        referenceId: v.id,
      });
    }
  }

  // Sort chronologically; same-date entries keep their natural DB order
  rows.sort((a, b) => {
    const dateCompare = a.date.localeCompare(b.date);
    if (dateCompare !== 0) return dateCompare;
    // Keep receipts before payments on the same date for determinism
    if (a.referenceType !== b.referenceType) return a.referenceType === "receipt_voucher" ? -1 : 1;
    return a.referenceId - b.referenceId;
  });

  // Compute running balance (debit reduces, credit increases — tenant owes less when paying)
  let balance = 0;
  const entries = rows.map((row, i) => {
    balance += row.credit - row.debit;
    return { id: i + 1, ...row, balance };
  });

  const totalCredit = entries.reduce((s, e) => s + e.credit, 0);
  const totalDebit = entries.reduce((s, e) => s + e.debit, 0);

  let tenantName: string | null = null;
  if (tenantId) {
    const [t] = await db
      .select({ name: tenantsTable.name })
      .from(tenantsTable)
      .where(eq(tenantsTable.id, tenantId));
    tenantName = t?.name ?? null;
  }

  res.json({
    tenantId,
    tenantName,
    entries,
    openingBalance: 0,
    closingBalance: balance,
    totalDebit,
    totalCredit,
  });
});

export default router;
