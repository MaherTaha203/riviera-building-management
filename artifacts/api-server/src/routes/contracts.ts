import { Router } from "express";
import { db, contractsTable, tenantsTable, unitsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { authMiddleware, type JwtPayload } from "../lib/auth";
import { logAction } from "../lib/audit";
import { generateContractNumber } from "../lib/vouchers";
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
    tenantName: tenantMap[c.tenantId] ?? "",
    unitNumber: unitMap[c.unitId] ?? "",
  })));
});

router.post("/contracts", authMiddleware, validateBody(CreateContractBody), async (req, res): Promise<void> => {
  const user = (req as typeof req & { user: JwtPayload }).user;
  const { tenantId, unitId, startDate, endDate, rentAmount, currency, exchangeRate, paymentFrequency, notes } = req.body;
  if (!tenantId || !unitId || !startDate || !endDate || rentAmount == null || !currency) {
    res.status(400).json({ error: "Missing required fields" });
    return;
  }
  const rate = Number(exchangeRate ?? 1);
  const amountILS = Number(rentAmount) * rate;
  const contractNumber = await generateContractNumber();
  const [contract] = await db.insert(contractsTable).values({
    contractNumber, tenantId: Number(tenantId), unitId: Number(unitId), startDate, endDate,
    rentAmount: String(rentAmount), currency, exchangeRate: String(rate),
    rentAmountILS: String(amountILS), paymentFrequency: paymentFrequency ?? "monthly",
    status: "active", notes: notes ?? null,
  }).returning();
  // mark unit as occupied
  await db.update(unitsTable).set({ status: "occupied" }).where(eq(unitsTable.id, Number(unitId)));
  await logAction(user, "CREATE", "contract", contract.id);
  res.status(201).json({ ...contract, rentAmount: Number(contract.rentAmount), exchangeRate: Number(contract.exchangeRate), rentAmountILS: Number(contract.rentAmountILS), tenantName: "", unitNumber: "" });
});

router.get("/contracts/:id", authMiddleware, async (req, res): Promise<void> => {
  const id = parseInt(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id, 10);
  const [contract] = await db.select().from(contractsTable).where(eq(contractsTable.id, id));
  if (!contract) { res.status(404).json({ error: "Contract not found" }); return; }
  res.json({ ...contract, rentAmount: Number(contract.rentAmount), exchangeRate: Number(contract.exchangeRate), rentAmountILS: Number(contract.rentAmountILS) });
});

router.patch("/contracts/:id", authMiddleware, validateBody(UpdateContractBody), async (req, res): Promise<void> => {
  const user = (req as typeof req & { user: JwtPayload }).user;
  const id = parseInt(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id, 10);
  const { startDate, endDate, rentAmount, currency, exchangeRate, paymentFrequency, status, notes } = req.body;
  const updates: Record<string, unknown> = {};
  if (startDate != null) updates.startDate = startDate;
  if (endDate != null) updates.endDate = endDate;
  if (rentAmount != null) updates.rentAmount = String(rentAmount);
  if (currency != null) updates.currency = currency;
  if (exchangeRate != null) {
    updates.exchangeRate = String(exchangeRate);
    if (rentAmount != null) updates.rentAmountILS = String(Number(rentAmount) * Number(exchangeRate));
  }
  if (paymentFrequency != null) updates.paymentFrequency = paymentFrequency;
  if (status != null) updates.status = status;
  if (notes !== undefined) updates.notes = notes;
  const [contract] = await db.update(contractsTable).set(updates).where(eq(contractsTable.id, id)).returning();
  if (!contract) { res.status(404).json({ error: "Contract not found" }); return; }
  await logAction(user, "UPDATE", "contract", contract.id);
  res.json({ ...contract, rentAmount: Number(contract.rentAmount), exchangeRate: Number(contract.exchangeRate), rentAmountILS: Number(contract.rentAmountILS) });
});

router.delete("/contracts/:id", authMiddleware, async (req, res): Promise<void> => {
  const user = (req as typeof req & { user: JwtPayload }).user;
  const id = parseInt(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id, 10);
  const [contract] = await db.delete(contractsTable).where(eq(contractsTable.id, id)).returning();
  if (!contract) { res.status(404).json({ error: "Contract not found" }); return; }
  // Reset the unit back to vacant when a contract is deleted
  await db.update(unitsTable).set({ status: "vacant" }).where(eq(unitsTable.id, contract.unitId));
  await logAction(user, "DELETE", "contract", contract.id);
  res.sendStatus(204);
});

export default router;
