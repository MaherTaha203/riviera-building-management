import { Router } from "express";
import { db, bankAccountsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { authMiddleware, type JwtPayload } from "../lib/auth";
import { logAction } from "../lib/audit";
import { validateBody } from "../lib/validate";
import { CreateBankAccountBody, UpdateBankAccountBody } from "@workspace/api-zod";

const router = Router();

router.get("/bank-accounts", authMiddleware, async (_req, res): Promise<void> => {
  const accounts = await db.select().from(bankAccountsTable).orderBy(bankAccountsTable.bankName);
  res.json(accounts.map(a => ({ ...a, balanceILS: Number(a.balanceILS) })));
});

router.post("/bank-accounts", authMiddleware, validateBody(CreateBankAccountBody), async (req, res): Promise<void> => {
  const user = (req as typeof req & { user: JwtPayload }).user;
  const { bankName, accountNumber, accountName, currency, notes } = req.body;
  if (!bankName || !accountNumber || !accountName || !currency) {
    res.status(400).json({ error: "Missing required fields" });
    return;
  }
  const [account] = await db.insert(bankAccountsTable).values({ bankName, accountNumber, accountName, currency, notes: notes ?? null }).returning();
  await logAction(user, "CREATE", "bank_account", account.id);
  res.status(201).json({ ...account, balanceILS: Number(account.balanceILS) });
});

router.get("/bank-accounts/:id", authMiddleware, async (req, res): Promise<void> => {
  const id = parseInt(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id, 10);
  const [a] = await db.select().from(bankAccountsTable).where(eq(bankAccountsTable.id, id));
  if (!a) { res.status(404).json({ error: "Not found" }); return; }
  res.json({ ...a, balanceILS: Number(a.balanceILS) });
});

router.patch("/bank-accounts/:id", authMiddleware, validateBody(UpdateBankAccountBody), async (req, res): Promise<void> => {
  const user = (req as typeof req & { user: JwtPayload }).user;
  const id = parseInt(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id, 10);
  const { bankName, accountNumber, accountName, currency, notes } = req.body;
  const updates: Record<string, unknown> = {};
  if (bankName != null) updates.bankName = bankName;
  if (accountNumber != null) updates.accountNumber = accountNumber;
  if (accountName != null) updates.accountName = accountName;
  if (currency != null) updates.currency = currency;
  if (notes !== undefined) updates.notes = notes;
  const [a] = await db.update(bankAccountsTable).set(updates).where(eq(bankAccountsTable.id, id)).returning();
  if (!a) { res.status(404).json({ error: "Not found" }); return; }
  await logAction(user, "UPDATE", "bank_account", a.id);
  res.json({ ...a, balanceILS: Number(a.balanceILS) });
});

router.delete("/bank-accounts/:id", authMiddleware, async (req, res): Promise<void> => {
  const user = (req as typeof req & { user: JwtPayload }).user;
  const id = parseInt(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id, 10);
  const [a] = await db.delete(bankAccountsTable).where(eq(bankAccountsTable.id, id)).returning();
  if (!a) { res.status(404).json({ error: "Not found" }); return; }
  await logAction(user, "DELETE", "bank_account", a.id);
  res.sendStatus(204);
});

export default router;
