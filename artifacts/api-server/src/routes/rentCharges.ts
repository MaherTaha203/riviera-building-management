import { Router } from "express";
import { db, rentChargesTable, contractsTable, tenantsTable, settingsTable } from "@workspace/db";
import { and, eq, sql, asc } from "drizzle-orm";
import { authMiddleware, type JwtPayload } from "../lib/auth";
import { logAction } from "../lib/audit";
import { validateBody } from "../lib/validate";
import { GenerateRentChargesBody, UpdateRentChargeBody } from "@workspace/api-zod";
import { generateChargesForContract, tenantAmountDueILS, computeLateFees, applyLateFees, type LateFeePolicy } from "../lib/receivables";
import { syncChargeLedger, clearChargeLedger } from "../lib/chargeLedger";

const today = () => new Date().toISOString().slice(0, 10);

/** Read the late-fee policy from settings (defaults: disabled). */
async function readLateFeePolicy(): Promise<LateFeePolicy> {
  const [s] = await db.select().from(settingsTable);
  return {
    enabled: s?.lateFeeEnabled === "true",
    graceDays: Number(s?.lateFeeGraceDays ?? 0),
    mode: (s?.lateFeeMode === "flat" ? "flat" : "percent"),
    rate: Number(s?.lateFeeRate ?? 0),
  };
}

const router = Router();

const shape = (c: typeof rentChargesTable.$inferSelect, tenantName: string | null = null) => ({
  ...c, amountILS: Number(c.amountILS), allocatedILS: Number(c.allocatedILS), tenantName,
});

/** List rent charges, optionally filtered by tenant and/or contract. */
router.get("/rent-charges", authMiddleware, async (req, res): Promise<void> => {
  const conds = [];
  if (req.query.tenantId) conds.push(eq(rentChargesTable.tenantId, parseInt(req.query.tenantId as string, 10)));
  if (req.query.contractId) conds.push(eq(rentChargesTable.contractId, parseInt(req.query.contractId as string, 10)));
  const rows = await db.select().from(rentChargesTable)
    .where(conds.length ? and(...conds) : undefined)
    .orderBy(asc(rentChargesTable.dueDate), asc(rentChargesTable.id));
  const tenants = await db.select({ id: tenantsTable.id, name: tenantsTable.name }).from(tenantsTable);
  const nameOf = Object.fromEntries(tenants.map((t) => [t.id, t.name]));
  res.json(rows.map((c) => shape(c, nameOf[c.tenantId] ?? null)));
});

/** Tenant receivables summary: total amount still due. */
router.get("/rent-charges/summary", authMiddleware, async (req, res): Promise<void> => {
  const tenantId = parseInt(req.query.tenantId as string, 10);
  if (!tenantId) { res.status(400).json({ error: "tenantId is required" }); return; }
  res.json({ tenantId, amountDueILS: await tenantAmountDueILS(db, tenantId) });
});

/** Generate rent charges for a contract up to a date (idempotent). */
router.post("/rent-charges/generate", authMiddleware, validateBody(GenerateRentChargesBody), async (req, res): Promise<void> => {
  const user = (req as typeof req & { user: JwtPayload }).user;
  const contractId = Number(req.body.contractId);
  const upToDate = req.body.upToDate ?? new Date().toISOString().slice(0, 10);
  const [contract] = await db.select().from(contractsTable).where(eq(contractsTable.id, contractId));
  if (!contract) { res.status(404).json({ error: "Contract not found" }); return; }

  const created = await db.transaction(async (tx) => {
    const rows = await generateChargesForContract(tx, {
      id: contract.id, tenantId: contract.tenantId, startDate: contract.startDate, endDate: contract.endDate,
      rentAmountILS: contract.rentAmountILS, paymentFrequency: contract.paymentFrequency, paymentCount: contract.paymentCount,
    }, upToDate, user.userId);
    // Post the accrual entry (DR income / CR receivable) for each new charge.
    for (const row of rows) {
      await syncChargeLedger(tx, { chargeId: row.id, tenantId: row.tenantId, amountILS: row.amountILS, txnDate: row.dueDate, status: row.status, kind: row.kind, createdBy: user.userId });
    }
    return rows;
  });
  if (created.length) await logAction(user, "CREATE", "rent_charge", contractId);
  res.status(201).json(created.map((c) => shape(c)));
});

/** Preview late fees that would be applied as of a date (read-only). */
router.get("/rent-charges/late-fees/preview", authMiddleware, async (req, res): Promise<void> => {
  const asOf = typeof req.query.asOf === "string" && /^\d{4}-\d{2}-\d{2}$/.test(req.query.asOf) ? req.query.asOf : today();
  const policy = await readLateFeePolicy();
  const candidates = await computeLateFees(db, policy, asOf);
  res.json({ asOf, policy, candidates, count: candidates.length, totalFeeILS: candidates.reduce((s, c) => s + c.feeILS, 0) });
});

/** Apply late fees as of a date: insert late-fee charges + post their ledger accrual. */
router.post("/rent-charges/late-fees/apply", authMiddleware, async (req, res): Promise<void> => {
  const user = (req as typeof req & { user: JwtPayload }).user;
  const asOf = typeof req.body?.asOf === "string" && /^\d{4}-\d{2}-\d{2}$/.test(req.body.asOf) ? req.body.asOf : today();
  const policy = await readLateFeePolicy();
  if (!policy.enabled) { res.status(400).json({ error: "رسوم التأخير غير مفعّلة في الإعدادات" }); return; }
  const created = await db.transaction(async (tx) => {
    const rows = await applyLateFees(tx, policy, asOf, user.userId);
    for (const row of rows) {
      await syncChargeLedger(tx, { chargeId: row.id, tenantId: row.tenantId, amountILS: row.amountILS, txnDate: row.dueDate, status: row.status, kind: row.kind, createdBy: user.userId });
    }
    return rows;
  });
  if (created.length) await logAction(user, "CREATE", "rent_charge");
  res.status(201).json({ asOf, count: created.length, totalFeeILS: created.reduce((s, c) => s + Number(c.amountILS), 0), created: created.map((c) => shape(c)) });
});

/** Adjust a charge's amount / due date / notes (corrects a data-entry mistake). */
router.patch("/rent-charges/:id", authMiddleware, validateBody(UpdateRentChargeBody), async (req, res): Promise<void> => {
  const user = (req as typeof req & { user: JwtPayload }).user;
  const id = parseInt(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id, 10);
  const updated = await db.transaction(async (tx) => {
    const [existing] = await tx.select().from(rentChargesTable).where(eq(rentChargesTable.id, id));
    if (!existing) return null;
    const updates: Record<string, unknown> = {};
    if (req.body.amountILS != null) updates.amountILS = String(req.body.amountILS);
    if (req.body.dueDate != null) updates.dueDate = req.body.dueDate;
    if (req.body.notes !== undefined) updates.notes = req.body.notes ?? null;
    // Recompute settled/open against the (possibly new) amount, unless cancelled.
    if (req.body.amountILS != null && existing.status !== "cancelled") {
      updates.status = Number(existing.allocatedILS) >= Number(req.body.amountILS) - 0.005 ? "settled" : "open";
    }
    const [row] = await tx.update(rentChargesTable).set(updates).where(eq(rentChargesTable.id, id)).returning();
    // Re-sync the accrual entry to the (possibly new) amount / due date / status.
    if (row) await syncChargeLedger(tx, { chargeId: row.id, tenantId: row.tenantId, amountILS: row.amountILS, txnDate: row.dueDate, status: row.status, kind: row.kind, createdBy: user.userId });
    return row ?? null;
  });
  if (!updated) { res.status(404).json({ error: "Not found" }); return; }
  await logAction(user, "UPDATE", "rent_charge", id);
  res.json(shape(updated));
});

/** Cancel a charge. Blocked while it still has allocated payments (unallocate first). */
router.post("/rent-charges/:id/cancel", authMiddleware, async (req, res): Promise<void> => {
  const user = (req as typeof req & { user: JwtPayload }).user;
  const id = parseInt(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id, 10);
  const result = await db.transaction(async (tx) => {
    const [existing] = await tx.select().from(rentChargesTable).where(eq(rentChargesTable.id, id));
    if (!existing) return { notFound: true as const };
    if (Number(existing.allocatedILS) > 0.005) return { conflict: true as const };
    const [row] = await tx.update(rentChargesTable).set({ status: "cancelled" }).where(eq(rentChargesTable.id, id)).returning();
    await clearChargeLedger(tx, id); // reverse the accrual entry
    return { row };
  });
  if ("notFound" in result) { res.status(404).json({ error: "Not found" }); return; }
  if ("conflict" in result) { res.status(409).json({ error: "لا يمكن إلغاء استحقاق مرتبط بدفعات؛ ألغِ تخصيص السندات أولاً" }); return; }
  await logAction(user, "UPDATE", "rent_charge", id);
  res.json(shape(result.row!));
});

export default router;
