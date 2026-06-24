import { Router } from "express";
import { db, unitsTable, contractsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { authMiddleware, type JwtPayload } from "../lib/auth";
import { logAction } from "../lib/audit";
import { validateBody } from "../lib/validate";
import { CreateUnitBody, UpdateUnitBody } from "@workspace/api-zod";

const router = Router();

router.get("/units", authMiddleware, async (_req, res): Promise<void> => {
  const units = await db.select().from(unitsTable).orderBy(unitsTable.unitNumber);
  res.json(units.map(u => ({ ...u, area: Number(u.area) })));
});

router.post("/units", authMiddleware, validateBody(CreateUnitBody), async (req, res): Promise<void> => {
  const user = (req as typeof req & { user: JwtPayload }).user;
  const { unitNumber, floor, type, area, status, description } = req.body;
  if (!unitNumber || !floor || !type || area == null) {
    res.status(400).json({ error: "Missing required fields" });
    return;
  }
  const [unit] = await db.insert(unitsTable).values({ unitNumber, floor, type, area: String(area), status: status ?? "vacant", description: description ?? null }).returning();
  await logAction(user, "CREATE", "unit", unit.id);
  res.status(201).json({ ...unit, area: Number(unit.area) });
});

router.get("/units/:id", authMiddleware, async (req, res): Promise<void> => {
  const id = parseInt(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id, 10);
  const [unit] = await db.select().from(unitsTable).where(eq(unitsTable.id, id));
  if (!unit) { res.status(404).json({ error: "Unit not found" }); return; }
  res.json({ ...unit, area: Number(unit.area) });
});

router.patch("/units/:id", authMiddleware, validateBody(UpdateUnitBody), async (req, res): Promise<void> => {
  const user = (req as typeof req & { user: JwtPayload }).user;
  const id = parseInt(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id, 10);
  const { unitNumber, floor, type, area, status, description } = req.body;
  const updates: Record<string, unknown> = {};
  if (unitNumber != null) updates.unitNumber = unitNumber;
  if (floor != null) updates.floor = floor;
  if (type != null) updates.type = type;
  if (area != null) updates.area = String(area);
  if (status != null) updates.status = status;
  if (description !== undefined) updates.description = description;
  const [unit] = await db.update(unitsTable).set(updates).where(eq(unitsTable.id, id)).returning();
  if (!unit) { res.status(404).json({ error: "Unit not found" }); return; }
  await logAction(user, "UPDATE", "unit", unit.id);
  res.json({ ...unit, area: Number(unit.area) });
});

router.delete("/units/:id", authMiddleware, async (req, res): Promise<void> => {
  const user = (req as typeof req & { user: JwtPayload }).user;
  const id = parseInt(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id, 10);
  // Referential integrity: block deletion while contracts still reference this unit.
  const [depContract] = await db.select({ id: contractsTable.id }).from(contractsTable).where(eq(contractsTable.unitId, id)).limit(1);
  if (depContract) {
    res.status(409).json({ error: "لا يمكن حذف الوحدة لارتباطها بعقود" });
    return;
  }
  const [unit] = await db.delete(unitsTable).where(eq(unitsTable.id, id)).returning();
  if (!unit) { res.status(404).json({ error: "Unit not found" }); return; }
  await logAction(user, "DELETE", "unit", unit.id);
  res.sendStatus(204);
});

export default router;
