import { Router } from "express";
import { db, tenantsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { authMiddleware, type JwtPayload } from "../lib/auth";
import { logAction } from "../lib/audit";
import { validateBody } from "../lib/validate";
import { CreateTenantBody, UpdateTenantBody } from "@workspace/api-zod";

const router = Router();

router.get("/tenants", authMiddleware, async (_req, res): Promise<void> => {
  const tenants = await db.select().from(tenantsTable).orderBy(tenantsTable.name);
  res.json(tenants.map(t => ({ ...t, balance: Number(t.balance) })));
});

router.post("/tenants", authMiddleware, validateBody(CreateTenantBody), async (req, res): Promise<void> => {
  const user = (req as typeof req & { user: JwtPayload }).user;
  const { name, type, phone, email, idNumber, address, notes } = req.body;
  if (!name || !type || !phone) {
    res.status(400).json({ error: "Missing required fields" });
    return;
  }
  const [tenant] = await db.insert(tenantsTable).values({ name, type, phone, email: email ?? null, idNumber: idNumber ?? null, address: address ?? null, notes: notes ?? null }).returning();
  await logAction(user, "CREATE", "tenant", tenant.id);
  res.status(201).json({ ...tenant, balance: Number(tenant.balance) });
});

router.get("/tenants/:id", authMiddleware, async (req, res): Promise<void> => {
  const id = parseInt(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id, 10);
  const [tenant] = await db.select().from(tenantsTable).where(eq(tenantsTable.id, id));
  if (!tenant) { res.status(404).json({ error: "Tenant not found" }); return; }
  res.json({ ...tenant, balance: Number(tenant.balance) });
});

router.patch("/tenants/:id", authMiddleware, validateBody(UpdateTenantBody), async (req, res): Promise<void> => {
  const user = (req as typeof req & { user: JwtPayload }).user;
  const id = parseInt(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id, 10);
  const { name, type, phone, email, idNumber, address, notes } = req.body;
  const updates: Record<string, unknown> = {};
  if (name != null) updates.name = name;
  if (type != null) updates.type = type;
  if (phone != null) updates.phone = phone;
  if (email !== undefined) updates.email = email;
  if (idNumber !== undefined) updates.idNumber = idNumber;
  if (address !== undefined) updates.address = address;
  if (notes !== undefined) updates.notes = notes;
  const [tenant] = await db.update(tenantsTable).set(updates).where(eq(tenantsTable.id, id)).returning();
  if (!tenant) { res.status(404).json({ error: "Tenant not found" }); return; }
  await logAction(user, "UPDATE", "tenant", tenant.id);
  res.json({ ...tenant, balance: Number(tenant.balance) });
});

router.delete("/tenants/:id", authMiddleware, async (req, res): Promise<void> => {
  const user = (req as typeof req & { user: JwtPayload }).user;
  const id = parseInt(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id, 10);
  const [tenant] = await db.delete(tenantsTable).where(eq(tenantsTable.id, id)).returning();
  if (!tenant) { res.status(404).json({ error: "Tenant not found" }); return; }
  await logAction(user, "DELETE", "tenant", tenant.id);
  res.sendStatus(204);
});

export default router;
