import { Router } from "express";
import { db, chequesTable, tenantsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { authMiddleware, type JwtPayload } from "../lib/auth";
import { logAction } from "../lib/audit";
import { validateBody } from "../lib/validate";
import { CreateChequeBody, UpdateChequeBody } from "@workspace/api-zod";

const router = Router();

router.get("/cheques", authMiddleware, async (req, res): Promise<void> => {
  const typeFilter = req.query.type as string | undefined;
  let cheques;
  if (typeFilter) {
    cheques = await db.select().from(chequesTable).where(eq(chequesTable.type, typeFilter)).orderBy(chequesTable.dueDate);
  } else {
    cheques = await db.select().from(chequesTable).orderBy(chequesTable.dueDate);
  }
  const tenants = await db.select({ id: tenantsTable.id, name: tenantsTable.name }).from(tenantsTable);
  const tenantMap = Object.fromEntries(tenants.map(t => [t.id, t.name]));
  res.json(cheques.map(c => ({ ...c, amount: Number(c.amount), exchangeRate: Number(c.exchangeRate), amountILS: Number(c.amountILS), tenantName: c.tenantId ? tenantMap[c.tenantId] ?? null : null })));
});

router.post("/cheques", authMiddleware, validateBody(CreateChequeBody), async (req, res): Promise<void> => {
  const user = (req as typeof req & { user: JwtPayload }).user;
  const { chequeNumber, type, amount, currency, exchangeRate, amountILS, bankName, chequeDate, dueDate, drawerName, tenantId, notes } = req.body;
  if (!chequeNumber || !type || amount == null || !currency || !bankName || !chequeDate || !dueDate || !drawerName) {
    res.status(400).json({ error: "Missing required fields" });
    return;
  }
  const [cheque] = await db.insert(chequesTable).values({
    chequeNumber, type, amount: String(amount), currency, exchangeRate: String(exchangeRate ?? 1), amountILS: String(amountILS),
    bankName, chequeDate, dueDate, status: "pending", drawerName,
    tenantId: tenantId ? Number(tenantId) : null, notes: notes ?? null,
  }).returning();
  await logAction(user, "CREATE", "cheque", cheque.id);
  res.status(201).json({ ...cheque, amount: Number(cheque.amount), exchangeRate: Number(cheque.exchangeRate), amountILS: Number(cheque.amountILS), tenantName: null });
});

router.get("/cheques/:id", authMiddleware, async (req, res): Promise<void> => {
  const id = parseInt(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id, 10);
  const [c] = await db.select().from(chequesTable).where(eq(chequesTable.id, id));
  if (!c) { res.status(404).json({ error: "Not found" }); return; }
  res.json({ ...c, amount: Number(c.amount), exchangeRate: Number(c.exchangeRate), amountILS: Number(c.amountILS), tenantName: null });
});

router.patch("/cheques/:id", authMiddleware, validateBody(UpdateChequeBody), async (req, res): Promise<void> => {
  const user = (req as typeof req & { user: JwtPayload }).user;
  const id = parseInt(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id, 10);
  const { status, notes, dueDate } = req.body;
  const updates: Record<string, unknown> = {};
  if (status != null) updates.status = status;
  if (notes !== undefined) updates.notes = notes;
  if (dueDate != null) updates.dueDate = dueDate;
  const [c] = await db.update(chequesTable).set(updates).where(eq(chequesTable.id, id)).returning();
  if (!c) { res.status(404).json({ error: "Not found" }); return; }
  await logAction(user, "UPDATE", "cheque", c.id);
  res.json({ ...c, amount: Number(c.amount), exchangeRate: Number(c.exchangeRate), amountILS: Number(c.amountILS), tenantName: null });
});

router.delete("/cheques/:id", authMiddleware, async (req, res): Promise<void> => {
  const user = (req as typeof req & { user: JwtPayload }).user;
  const id = parseInt(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id, 10);
  const [c] = await db.delete(chequesTable).where(eq(chequesTable.id, id)).returning();
  if (!c) { res.status(404).json({ error: "Not found" }); return; }
  await logAction(user, "DELETE", "cheque", c.id);
  res.sendStatus(204);
});

export default router;
