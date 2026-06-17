import { Router } from "express";
import { db, documentsTable, tenantsTable, contractsTable, unitsTable } from "@workspace/db";
import { eq, and, type SQL } from "drizzle-orm";
import { authMiddleware, type JwtPayload } from "../lib/auth";
import { logAction } from "../lib/audit";
import { validateBody } from "../lib/validate";
import { CreateDocumentBody } from "@workspace/api-zod";

const router = Router();

router.get("/documents", authMiddleware, async (req, res): Promise<void> => {
  const entityType = req.query.entityType as string | undefined;
  const entityId = req.query.entityId ? parseInt(req.query.entityId as string, 10) : null;

  const conditions: SQL[] = [];
  if (entityType) conditions.push(eq(documentsTable.entityType, entityType));
  if (entityId) conditions.push(eq(documentsTable.entityId, entityId));

  const docs = await db.select().from(documentsTable)
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(documentsTable.createdAt);

  const tenants = await db.select({ id: tenantsTable.id, name: tenantsTable.name }).from(tenantsTable);
  const contracts = await db.select({ id: contractsTable.id, contractNumber: contractsTable.contractNumber }).from(contractsTable);
  const units = await db.select({ id: unitsTable.id, unitNumber: unitsTable.unitNumber }).from(unitsTable);
  const nameMap: Record<string, Record<number, string>> = {
    tenant: Object.fromEntries(tenants.map(t => [t.id, t.name])),
    contract: Object.fromEntries(contracts.map(c => [c.id, c.contractNumber])),
    unit: Object.fromEntries(units.map(u => [u.id, u.unitNumber])),
  };

  res.json(docs.map(d => ({ ...d, entityName: d.entityId && nameMap[d.entityType] ? nameMap[d.entityType][d.entityId] ?? null : null })));
});

router.post("/documents", authMiddleware, validateBody(CreateDocumentBody), async (req, res): Promise<void> => {
  const user = (req as typeof req & { user: JwtPayload }).user;
  const { name, entityType, entityId, fileType, fileSize, fileUrl, notes } = req.body;
  if (!name || !entityType || !fileType) {
    res.status(400).json({ error: "Missing required fields" });
    return;
  }
  const [doc] = await db.insert(documentsTable).values({
    name, entityType, entityId: entityId ? Number(entityId) : null,
    fileType, fileSize: fileSize ?? null, fileUrl: fileUrl ?? null, notes: notes ?? null,
  }).returning();
  await logAction(user, "CREATE", "document", doc.id);
  res.status(201).json({ ...doc, entityName: null });
});

router.get("/documents/:id", authMiddleware, async (req, res): Promise<void> => {
  const id = parseInt(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id, 10);
  const [d] = await db.select().from(documentsTable).where(eq(documentsTable.id, id));
  if (!d) { res.status(404).json({ error: "Not found" }); return; }
  res.json({ ...d, entityName: null });
});

router.delete("/documents/:id", authMiddleware, async (req, res): Promise<void> => {
  const user = (req as typeof req & { user: JwtPayload }).user;
  const id = parseInt(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id, 10);
  const [d] = await db.delete(documentsTable).where(eq(documentsTable.id, id)).returning();
  if (!d) { res.status(404).json({ error: "Not found" }); return; }
  await logAction(user, "DELETE", "document", d.id);
  res.sendStatus(204);
});

export default router;
