import { Router } from "express";
import { db, unitsTable, tenantsTable, contractsTable, receiptVouchersTable, paymentVouchersTable, chequesTable, bankAccountsTable, auditLogTable } from "@workspace/db";
import { desc } from "drizzle-orm";
import { sql } from "drizzle-orm";
import { authMiddleware } from "../lib/auth";
import { smark } from "../lib/diag";

const router = Router();

router.get("/dashboard/summary", authMiddleware, async (_req, res): Promise<void> => {
  smark("summary_start");
  const now = new Date();
  const firstOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split("T")[0];
  const thirtyDaysFromNow = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000).toISOString().split("T")[0];

  // Phase 3 — same result, fewer round-trips. Conditional aggregation collapses
  // the previous 12 sequential single-value queries into 7 one-per-table
  // aggregates, run in parallel (7 < pool max 10, so no exhaustion). On Neon
  // this turns ~12 serial network round-trips into effectively one wave.
  const [units, tenants, contracts, receipts, payments, cheques, banks] = await Promise.all([
    db.select({
      total: sql<number>`count(*)`,
      occupied: sql<number>`count(*) filter (where status = 'occupied')`,
      vacant: sql<number>`count(*) filter (where status = 'vacant')`,
    }).from(unitsTable),
    db.select({ count: sql<number>`count(*)` }).from(tenantsTable),
    db.select({
      active: sql<number>`count(*) filter (where status = 'active')`,
      expiring: sql<number>`count(*) filter (where status = 'active' and end_date <= ${thirtyDaysFromNow})`,
    }).from(contractsTable),
    db.select({
      monthly: sql<number>`coalesce(sum(amount_ils) filter (where date >= ${firstOfMonth}), 0)`,
      cash: sql<number>`coalesce(sum(amount_ils) filter (where payment_method = 'cash'), 0)`,
    }).from(receiptVouchersTable),
    db.select({
      monthly: sql<number>`coalesce(sum(amount_ils) filter (where date >= ${firstOfMonth}), 0)`,
      cash: sql<number>`coalesce(sum(amount_ils) filter (where payment_method = 'cash'), 0)`,
    }).from(paymentVouchersTable),
    db.select({ pending: sql<number>`count(*) filter (where status = 'pending')` }).from(chequesTable),
    db.select({ bal: sql<number>`coalesce(sum(balance_ils), 0)` }).from(bankAccountsTable),
  ]);
  const cashBalance = Number(receipts[0]?.cash ?? 0) - Number(payments[0]?.cash ?? 0);
  smark("summary_computed");

  res.json({
    totalUnits: Number(units[0]?.total ?? 0),
    occupiedUnits: Number(units[0]?.occupied ?? 0),
    vacantUnits: Number(units[0]?.vacant ?? 0),
    totalTenants: Number(tenants[0]?.count ?? 0),
    activeContracts: Number(contracts[0]?.active ?? 0),
    expiringContractsSoon: Number(contracts[0]?.expiring ?? 0),
    monthlyReceiptsILS: Number(receipts[0]?.monthly ?? 0),
    monthlyPaymentsILS: Number(payments[0]?.monthly ?? 0),
    cashBalanceILS: cashBalance,
    totalBankBalanceILS: Number(banks[0]?.bal ?? 0),
    pendingCheques: Number(cheques[0]?.pending ?? 0),
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

// Phase 3 — lightweight "latest 5 receipts" for the dashboard. Previously the
// dashboard pulled the ENTIRE receipt-vouchers list (~620KB, plus tenant/
// contract/unit denormalization) just to render five rows. This returns only
// the columns the dashboard shows, from one small ORDER BY ... LIMIT 5 query.
// (At current volumes the sort is trivial; add an index on (date desc, id desc)
// if the table grows large — that would need a schema migration.)
router.get("/dashboard/latest-receipts", authMiddleware, async (_req, res): Promise<void> => {
  const rows = await db
    .select({
      id: receiptVouchersTable.id,
      voucherNumber: receiptVouchersTable.voucherNumber,
      date: receiptVouchersTable.date,
      payerName: receiptVouchersTable.payerName,
      amountILS: receiptVouchersTable.amountILS,
      paymentMethod: receiptVouchersTable.paymentMethod,
    })
    .from(receiptVouchersTable)
    .orderBy(desc(receiptVouchersTable.date), desc(receiptVouchersTable.id))
    .limit(5);
  res.json(rows.map(r => ({ ...r, amountILS: Number(r.amountILS) })));
});

export default router;
