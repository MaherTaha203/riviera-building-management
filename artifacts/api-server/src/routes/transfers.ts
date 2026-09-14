import { Router } from "express";
import { db, transfersTable, accountsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { authMiddleware, type JwtPayload } from "../lib/auth";
import { logAction } from "../lib/audit";
import { validateBody } from "../lib/validate";
import { CreateTransferBody } from "@workspace/api-zod";
import { setTransferLedgerEffect } from "../lib/ledger";

const router = Router();

const shape = (t: typeof transfersTable.$inferSelect, names: Map<number, string>) => ({
  ...t, amountILS: Number(t.amountILS),
  fromAccountName: names.get(t.fromAccountId) ?? null,
  toAccountName: names.get(t.toAccountId) ?? null,
});

async function accountNames(): Promise<Map<number, string>> {
  const accs = await db.select({ id: accountsTable.id, name: accountsTable.name }).from(accountsTable);
  return new Map(accs.map(a => [a.id, a.name]));
}

/** List account-to-account transfers, newest first. */
router.get("/transfers", authMiddleware, async (_req, res): Promise<void> => {
  const rows = await db.select().from(transfersTable).orderBy(transfersTable.txnDate, transfersTable.id);
  const names = await accountNames();
  res.json(rows.map(t => shape(t, names)).reverse());
});

/** Create a transfer: insert the row and post the balanced debit/credit pair. */
router.post("/transfers", authMiddleware, validateBody(CreateTransferBody), async (req, res): Promise<void> => {
  const user = (req as typeof req & { user: JwtPayload }).user;
  const { fromAccountId, toAccountId, amountILS, txnDate, reference, notes } = req.body;
  if (Number(fromAccountId) === Number(toAccountId)) {
    res.status(400).json({ error: "لا يمكن التحويل إلى نفس الحساب" });
    return;
  }
  if (!(Number(amountILS) > 0)) {
    res.status(400).json({ error: "أدخل مبلغاً أكبر من صفر" });
    return;
  }
  // Both accounts must exist (the FK enforces it too; this gives a clean 400).
  const accs = await db.select({ id: accountsTable.id }).from(accountsTable);
  const ids = new Set(accs.map(a => a.id));
  if (!ids.has(Number(fromAccountId)) || !ids.has(Number(toAccountId))) {
    res.status(400).json({ error: "حساب غير موجود" });
    return;
  }

  const created = await db.transaction(async (tx) => {
    const [inserted] = await tx.insert(transfersTable).values({
      fromAccountId: Number(fromAccountId), toAccountId: Number(toAccountId),
      amountILS: String(amountILS), txnDate, reference: reference ?? null, notes: notes ?? null,
      createdBy: user.userId,
    }).returning();
    await setTransferLedgerEffect(tx, inserted.id, {
      fromAccountId: inserted.fromAccountId, toAccountId: inserted.toAccountId,
      amountILS: Number(inserted.amountILS), txnDate: inserted.txnDate,
      reference: inserted.reference, createdBy: user.userId,
    });
    return inserted;
  });
  await logAction(user, "CREATE", "transfer", created.id);
  const names = await accountNames();
  res.status(201).json(shape(created, names));
});

/** Delete a transfer: reverse its ledger pair (audit trail kept), then remove it. */
router.delete("/transfers/:id", authMiddleware, async (req, res): Promise<void> => {
  const user = (req as typeof req & { user: JwtPayload }).user;
  const id = parseInt(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id, 10);
  const existing = await db.transaction(async (tx) => {
    const [row] = await tx.select().from(transfersTable).where(eq(transfersTable.id, id));
    if (!row) return null;
    await setTransferLedgerEffect(tx, id, null); // reverse the debit/credit pair
    await tx.delete(transfersTable).where(eq(transfersTable.id, id));
    return row;
  });
  if (!existing) { res.status(404).json({ error: "Not found" }); return; }
  await logAction(user, "DELETE", "transfer", existing.id);
  res.sendStatus(204);
});

export default router;
