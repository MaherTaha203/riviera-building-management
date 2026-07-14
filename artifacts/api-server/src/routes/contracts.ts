import { Router } from "express";
import { db, contractsTable, tenantsTable, unitsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { authMiddleware, type JwtPayload } from "../lib/auth";
import { logAction } from "../lib/audit";
import { generateContractNumber } from "../lib/vouchers";
import { syncUnitStatus } from "../lib/occupancy";
import { validateBody } from "../lib/validate";
import { CreateContractBody, UpdateContractBody } from "@workspace/api-zod";

const router = Router();

router.get("/contracts", authMiddleware, async (_req, res): Promise<void> => {
  const contracts = await db.select().from(contractsTable).orderBy(contractsTable.createdAt);
  const tenants = await db.select({ id: tenantsTable.id, name: tenantsTable.name }).from(tenantsTable);
  const units = await db.select({ id: unitsTable.id, unitNumber: unitsTable.unitNumber }).from(unitsTable);
  const tenantMap = Object.fromEntries(tenants.map(t => [t.id, t.name]));
  const unitMap = Object.fromEntries(units.map(u => [u.id, u.unitNumber]));
  res.json(contracts.map(c => ({
    ...c,
    rentAmount: Number(c.rentAmount),
    exchangeRate: Number(c.exchangeRate),
    rentAmountILS: Number(c.rentAmountILS),
    depositAmount: c.depositAmount != null ? Number(c.depositAmount) : null,
    tenantName: tenantMap[c.tenantId] ?? "",
    unitNumber: unitMap[c.unitId] ?? "",
  })));
});

router.post("/contracts", authMiddleware, validateBody(CreateContractBody), async (req, res): Promise<void> => {
  const user = (req as typeof req & { user: JwtPayload }).user;
  const { tenantId, unitId, startDate, endDate, rentAmount, currency, exchangeRate, paymentFrequency, notes, depositAmount, paymentCount, additionalTerms, paymentMethod } = req.body;
  if (!tenantId || !unitId || !startDate || !endDate || rentAmount == null || !currency) {
    res.status(400).json({ error: "Missing required fields" });
    return;
  }
  // Referential integrity: reject contracts that reference a non-existent tenant or unit.
  const [tenantRef] = await db.select({ id: tenantsTable.id }).from(tenantsTable).where(eq(tenantsTable.id, Number(tenantId)));
  if (!tenantRef) { res.status(400).json({ error: "Tenant not found" }); return; }
  const [unitRef] = await db.select({ id: unitsTable.id }).from(unitsTable).where(eq(unitsTable.id, Number(unitId)));
  if (!unitRef) { res.status(400).json({ error: "Unit not found" }); return; }
  const rate = Number(exchangeRate ?? 1);
  const amountILS = Number(rentAmount) * rate;
  // Atomically generate contract number + insert + sync unit occupancy in one
  // transaction, so the unit can never be left in a stale occupancy state.
  const contract = await db.transaction(async (tx) => {
    const contractNumber = await generateContractNumber(tx);
    const [inserted] = await tx.insert(contractsTable).values({
      contractNumber, tenantId: Number(tenantId), unitId: Number(unitId), startDate, endDate,
      rentAmount: String(rentAmount), currency, exchangeRate: String(rate),
      rentAmountILS: String(amountILS), paymentFrequency: paymentFrequency ?? "monthly",
      status: "active", notes: notes ?? null,
      depositAmount: depositAmount != null ? String(depositAmount) : null,
      paymentCount: paymentCount != null ? Number(paymentCount) : null,
      additionalTerms: additionalTerms ?? null,
      paymentMethod: paymentMethod ?? null,
    }).returning();
    await syncUnitStatus(tx, Number(unitId));
    return inserted;
  });
  await logAction(user, "CREATE", "contract", contract.id);
  res.status(201).json({ ...contract, rentAmount: Number(contract.rentAmount), exchangeRate: Number(contract.exchangeRate), rentAmountILS: Number(contract.rentAmountILS), depositAmount: contract.depositAmount != null ? Number(contract.depositAmount) : null, tenantName: "", unitNumber: "" });
});

router.get("/contracts/:id", authMiddleware, async (req, res): Promise<void> => {
  const id = parseInt(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id, 10);
  const [contract] = await db.select().from(contractsTable).where(eq(contractsTable.id, id));
  if (!contract) { res.status(404).json({ error: "Contract not found" }); return; }
  res.json({ ...contract, rentAmount: Number(contract.rentAmount), exchangeRate: Number(contract.exchangeRate), rentAmountILS: Number(contract.rentAmountILS), depositAmount: contract.depositAmount != null ? Number(contract.depositAmount) : null });
});

router.patch("/contracts/:id", authMiddleware, validateBody(UpdateContractBody), async (req, res): Promise<void> => {
  const user = (req as typeof req & { user: JwtPayload }).user;
  const id = parseInt(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id, 10);
  const { startDate, endDate, rentAmount, currency, exchangeRate, paymentFrequency, status, notes, depositAmount, paymentCount, additionalTerms, paymentMethod } = req.body;
  // Fetch existing to get current rentAmount / exchangeRate for ILS recomputation
  const [existing] = await db.select().from(contractsTable).where(eq(contractsTable.id, id));
  if (!existing) { res.status(404).json({ error: "Contract not found" }); return; }
  const updates: Record<string, unknown> = {};
  if (startDate != null) updates.startDate = startDate;
  if (endDate != null) updates.endDate = endDate;
  if (rentAmount != null) updates.rentAmount = String(rentAmount);
  if (currency != null) updates.currency = currency;
  if (exchangeRate != null) updates.exchangeRate = String(exchangeRate);
  if (paymentFrequency != null) updates.paymentFrequency = paymentFrequency;
  if (status != null) updates.status = status;
  if (notes !== undefined) updates.notes = notes;
  if (depositAmount !== undefined) updates.depositAmount = depositAmount != null ? String(depositAmount) : null;
  if (paymentCount !== undefined) updates.paymentCount = paymentCount != null ? Number(paymentCount) : null;
  if (additionalTerms !== undefined) updates.additionalTerms = additionalTerms;
  if (paymentMethod !== undefined) updates.paymentMethod = paymentMethod;
  // Recompute rentAmountILS whenever either component changes (use existing value for the unchanged one)
  if (rentAmount != null || exchangeRate != null) {
    const effectiveRent = rentAmount != null ? Number(rentAmount) : Number(existing.rentAmount);
    const effectiveRate = exchangeRate != null ? Number(exchangeRate) : Number(existing.exchangeRate);
    updates.rentAmountILS = String(effectiveRent * effectiveRate);
  }
  // Update + re-derive unit occupancy atomically: a status change to/from
  // "active" (e.g. terminating a contract) must flip the unit in the same step.
  const contract = await db.transaction(async (tx) => {
    const [updated] = await tx.update(contractsTable).set(updates).where(eq(contractsTable.id, id)).returning();
    if (updated) await syncUnitStatus(tx, updated.unitId);
    return updated ?? null;
  });
  if (!contract) { res.status(404).json({ error: "Contract not found" }); return; }
  await logAction(user, "UPDATE", "contract", contract.id);
  res.json({ ...contract, rentAmount: Number(contract.rentAmount), exchangeRate: Number(contract.exchangeRate), rentAmountILS: Number(contract.rentAmountILS), depositAmount: contract.depositAmount != null ? Number(contract.depositAmount) : null });
});

router.delete("/contracts/:id", authMiddleware, async (req, res): Promise<void> => {
  const user = (req as typeof req & { user: JwtPayload }).user;
  const id = parseInt(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id, 10);
  // Delete + re-derive unit occupancy atomically. Re-deriving (rather than
  // blindly setting "vacant") keeps the unit "occupied" when ANOTHER active
  // contract still references it, and preserves a manual "maintenance" hold.
  const contract = await db.transaction(async (tx) => {
    const [deleted] = await tx.delete(contractsTable).where(eq(contractsTable.id, id)).returning();
    if (deleted) await syncUnitStatus(tx, deleted.unitId);
    return deleted ?? null;
  });
  if (!contract) { res.status(404).json({ error: "Contract not found" }); return; }
  await logAction(user, "DELETE", "contract", contract.id);
  res.sendStatus(204);
});

export default router;
