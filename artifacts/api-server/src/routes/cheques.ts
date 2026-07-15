import { Router } from "express";
import { db, chequesTable, tenantsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { authMiddleware, type JwtPayload } from "../lib/auth";
import { logAction } from "../lib/audit";
import { applyBankDelta, chequeBankContribution } from "../lib/bank";
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
  const { chequeNumber, type, amount, currency, exchangeRate, amountILS, bankName, chequeDate, dueDate, drawerName, tenantId, bankAccountId, notes } = req.body;
  if (!chequeNumber || !type || amount == null || !currency || !bankName || !chequeDate || !dueDate || !drawerName) {
    res.status(400).json({ error: "Missing required fields" });
    return;
  }
  // Created as "pending", so no bank movement yet — the balance only moves when
  // the cheque later clears (see PATCH). We just record the settlement account.
  const [cheque] = await db.insert(chequesTable).values({
    chequeNumber, type, amount: String(amount), currency, exchangeRate: String(exchangeRate ?? 1), amountILS: String(amountILS),
    bankName, chequeDate, dueDate, status: "pending", drawerName,
    tenantId: tenantId ? Number(tenantId) : null,
    bankAccountId: bankAccountId != null ? Number(bankAccountId) : null,
    notes: notes ?? null,
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
  const { status, notes, dueDate, bankAccountId } = req.body;

  // Clearing/bouncing a cheque (or moving its settlement account) changes the
  // bank balance. Reverse the old contribution and apply the new one — keyed by
  // bank_account_id — atomically with the update. Amount and type are immutable
  // here, so only status and the account can change the contribution.
  const c = await db.transaction(async (tx) => {
    const [existing] = await tx.select().from(chequesTable).where(eq(chequesTable.id, id));
    if (!existing) return null;

    const newStatus = status != null ? status : existing.status;
    const newBankAccountId = bankAccountId !== undefined
      ? (bankAccountId != null ? Number(bankAccountId) : null)
      : existing.bankAccountId;
    const amountILS = Number(existing.amountILS);
    const oldContribution = chequeBankContribution(existing.type, existing.status, amountILS);
    const newContribution = chequeBankContribution(existing.type, newStatus, amountILS);

    if (oldContribution !== 0 || newContribution !== 0 || newBankAccountId !== existing.bankAccountId) {
      // bankName is the drawer's bank, not ours — resolve strictly by id.
      if (oldContribution !== 0) await applyBankDelta(tx, { bankAccountId: existing.bankAccountId }, -oldContribution);
      if (newContribution !== 0) await applyBankDelta(tx, { bankAccountId: newBankAccountId }, newContribution);
    }

    const updates: Record<string, unknown> = {};
    if (status != null) updates.status = status;
    if (notes !== undefined) updates.notes = notes;
    if (dueDate != null) updates.dueDate = dueDate;
    if (bankAccountId !== undefined) updates.bankAccountId = newBankAccountId;
    const [updated] = await tx.update(chequesTable).set(updates).where(eq(chequesTable.id, id)).returning();
    return updated ?? null;
  });
  if (!c) { res.status(404).json({ error: "Not found" }); return; }
  await logAction(user, "UPDATE", "cheque", c.id);
  res.json({ ...c, amount: Number(c.amount), exchangeRate: Number(c.exchangeRate), amountILS: Number(c.amountILS), tenantName: null });
});

router.delete("/cheques/:id", authMiddleware, async (req, res): Promise<void> => {
  const user = (req as typeof req & { user: JwtPayload }).user;
  const id = parseInt(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id, 10);
  // Reverse any bank contribution (i.e. if it had cleared) before deleting.
  const c = await db.transaction(async (tx) => {
    const [existing] = await tx.select().from(chequesTable).where(eq(chequesTable.id, id));
    if (!existing) return null;
    const contribution = chequeBankContribution(existing.type, existing.status, Number(existing.amountILS));
    if (contribution !== 0) await applyBankDelta(tx, { bankAccountId: existing.bankAccountId }, -contribution);
    await tx.delete(chequesTable).where(eq(chequesTable.id, id));
    return existing;
  });
  if (!c) { res.status(404).json({ error: "Not found" }); return; }
  await logAction(user, "DELETE", "cheque", c.id);
  res.sendStatus(204);
});

export default router;
