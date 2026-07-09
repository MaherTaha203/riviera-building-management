import { Router } from "express";
import { db, unitsTable, tenantsTable, contractsTable, receiptVouchersTable, paymentVouchersTable, chequesTable, bankAccountsTable, auditLogTable } from "@workspace/db";
import { sql, eq, gte, and } from "drizzle-orm";
import { authMiddleware } from "../lib/auth";
import { smark } from "../lib/diag";

const router = Router();

router.get("/dashboard/summary", authMiddleware, async (_req, res): Promise<void> => {
  smark("summary_start");
  const now = new Date();
  const firstOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split("T")[0];
  const thirtyDaysFromNow = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000).toISOString().split("T")[0];

  const [totalUnits] = await db.select({ count: sql<number>`count(*)` }).from(unitsTable);
  const [occupied] = await db.select({ count: sql<number>`count(*)` }).from(unitsTable).where(eq(unitsTable.status, "occupied"));
  const [vacant] = await db.select({ count: sql<number>`count(*)` }).from(unitsTable).where(eq(unitsTable.status, "vacant"));
  const [totalTenants] = await db.select({ count: sql<number>`count(*)` }).from(tenantsTable);
  const [activeContracts] = await db.select({ count: sql<number>`count(*)` }).from(contractsTable).where(eq(contractsTable.status, "active"));
  const [expiring] = await db.select({ count: sql<number>`count(*)` }).from(contractsTable)
    .where(and(eq(contractsTable.status, "active"), sql`end_date <= ${thirtyDaysFromNow}`));

  const [receipts] = await db.select({ total: sql<number>`coalesce(sum(amount_ils), 0)` }).from(receiptVouchersTable)
    .where(gte(receiptVouchersTable.date, firstOfMonth));
  const [payments] = await db.select({ total: sql<number>`coalesce(sum(amount_ils), 0)` }).from(paymentVouchersTable)
    .where(gte(paymentVouchersTable.date, firstOfMonth));

  const [pendingCheques] = await db.select({ count: sql<number>`count(*)` }).from(chequesTable).where(eq(chequesTable.status, "pending"));

  const bankBalances = await db.select({ bal: sql<number>`coalesce(sum(balance_ils), 0)` }).from(bankAccountsTable);
  const cashIn = await db.select({ total: sql<number>`coalesce(sum(amount_ils), 0)` }).from(receiptVouchersTable).where(eq(receiptVouchersTable.paymentMethod, "cash"));
  const cashOut = await db.select({ total: sql<number>`coalesce(sum(amount_ils), 0)` }).from(paymentVouchersTable).where(eq(paymentVouchersTable.paymentMethod, "cash"));
  const cashBalance = Number(cashIn[0]?.total ?? 0) - Number(cashOut[0]?.total ?? 0);
  smark("summary_computed");

  res.json({
    totalUnits: Number(totalUnits.count),
    occupiedUnits: Number(occupied.count),
    vacantUnits: Number(vacant.count),
    totalTenants: Number(totalTenants.count),
    activeContracts: Number(activeContracts.count),
    expiringContractsSoon: Number(expiring.count),
    monthlyReceiptsILS: Number(receipts.total),
    monthlyPaymentsILS: Number(payments.total),
    cashBalanceILS: cashBalance,
    totalBankBalanceILS: Number(bankBalances[0]?.bal ?? 0),
    pendingCheques: Number(pendingCheques.count),
  });
});

router.get("/dashboard/recent-activity", authMiddleware, async (_req, res): Promise<void> => {
  smark("activity_start");
  const entries = await db.select().from(auditLogTable).orderBy(sql`created_at desc`).limit(15);
  smark("activity_queried");
  res.json(entries.map(e => ({
    id: e.id,
    type: e.action,
    description: `${e.action} ${e.entityType}${e.entityId ? ` #${e.entityId}` : ""}`,
    entityId: e.entityId,
    entityType: e.entityType,
    createdAt: e.createdAt,
  })));
});

export default router;
