import { Router } from "express";
import { db, receiptVouchersTable, tenantsTable } from "@workspace/db";
import { eq, gte, lte, and, SQL } from "drizzle-orm";
import { authMiddleware } from "../lib/auth";

const router = Router();

router.get("/account-statements", authMiddleware, async (req, res): Promise<void> => {
  const tenantId = req.query.tenantId ? parseInt(req.query.tenantId as string, 10) : null;
  const from = req.query.from as string | undefined;
  const to = req.query.to as string | undefined;

  const conditions: SQL[] = [];
  if (tenantId) conditions.push(eq(receiptVouchersTable.tenantId, tenantId));
  if (from) conditions.push(gte(receiptVouchersTable.date, from));
  if (to) conditions.push(lte(receiptVouchersTable.date, to));

  const vouchers = await db.select().from(receiptVouchersTable)
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(receiptVouchersTable.date);

  let tenantName: string | null = null;
  if (tenantId) {
    const [t] = await db.select({ name: tenantsTable.name }).from(tenantsTable).where(eq(tenantsTable.id, tenantId));
    tenantName = t?.name ?? null;
  }

  let balance = 0;
  const entries = vouchers.map((v, i) => {
    const credit = Number(v.amountILS);
    balance += credit;
    return { id: i + 1, date: v.date, description: `${v.voucherNumber} - ${v.payerName}`, debit: 0, credit, balance, referenceType: "receipt_voucher", referenceId: v.id };
  });

  const totalCredit = entries.reduce((s, e) => s + e.credit, 0);
  const totalDebit = entries.reduce((s, e) => s + e.debit, 0);

  res.json({ tenantId, tenantName, entries, openingBalance: 0, closingBalance: balance, totalDebit, totalCredit });
});

export default router;
