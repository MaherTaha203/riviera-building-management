import { Router } from "express";
import { db, bankAccountsTable, receiptVouchersTable, paymentVouchersTable, chequesTable, accountsTable, financialMovementsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { authMiddleware, type JwtPayload } from "../lib/auth";
import { logAction } from "../lib/audit";
import { mirrorBankAccount } from "../lib/accounts";
import { accountBalanceILS, accountPostedMovementCount } from "../lib/ledger";
import { validateBody } from "../lib/validate";
import { CreateBankAccountBody, UpdateBankAccountBody } from "@workspace/api-zod";

const router = Router();

router.get("/bank-accounts", authMiddleware, async (_req, res): Promise<void> => {
  const accounts = await db.select().from(bankAccountsTable).orderBy(bankAccountsTable.bankName);
  // Read-cutover (Phase 1): each bank balance is the ledger projection of its
  // mirror account (authoritative). The stored balance_ils is a self-guarding
  // fallback — used only until the mirror carries a posted movement — so a
  // balance is never wrongly shown as zero on a not-yet-populated account.
  const mirrors = await db.select({ id: accountsTable.id, legacyId: accountsTable.legacyBankAccountId }).from(accountsTable);
  const mirrorByLegacy = new Map(mirrors.filter(m => m.legacyId != null).map(m => [m.legacyId as number, m.id]));
  const out = [];
  for (const a of accounts) {
    const mirrorId = mirrorByLegacy.get(a.id);
    const balanceILS = (mirrorId != null && (await accountPostedMovementCount(db, mirrorId)) > 0)
      ? await accountBalanceILS(db, mirrorId)
      : Number(a.balanceILS);
    out.push({ ...a, balanceILS });
  }
  res.json(out);
});

router.post("/bank-accounts", authMiddleware, validateBody(CreateBankAccountBody), async (req, res): Promise<void> => {
  const user = (req as typeof req & { user: JwtPayload }).user;
  const { bankName, accountNumber, accountName, currency, notes } = req.body;
  if (!bankName || !accountNumber || !accountName || !currency) {
    res.status(400).json({ error: "Missing required fields" });
    return;
  }
  // Create the legacy row AND its unified-accounts mirror atomically, so every
  // bank account is always resolvable as a ledger account (Phase 1, D3).
  const account = await db.transaction(async (tx) => {
    const [created] = await tx.insert(bankAccountsTable).values({ bankName, accountNumber, accountName, currency, notes: notes ?? null }).returning();
    await mirrorBankAccount(tx, created);
    return created;
  });
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
  // F2 guard: block deletion while any financial record still references this
  // bank account — otherwise the DB FK (ON DELETE RESTRICT) would reject it with
  // a raw 500. Give a clean 409 instead, and reverse the ledger mirror in-tx.
  const result = await db.transaction(async (tx) => {
    const [dep] =
      (await tx.select({ id: receiptVouchersTable.id }).from(receiptVouchersTable).where(eq(receiptVouchersTable.bankAccountId, id)).limit(1))
      .concat(await tx.select({ id: paymentVouchersTable.id }).from(paymentVouchersTable).where(eq(paymentVouchersTable.bankAccountId, id)).limit(1))
      .concat(await tx.select({ id: chequesTable.id }).from(chequesTable).where(eq(chequesTable.bankAccountId, id)).limit(1));
    if (dep) return { conflict: "refs" as const };

    // The ledger mirror (kept in sync since slice 4) may carry posted movements
    // — including reversals that outlive a deleted voucher (append-only: history
    // is never erased, freeze §15). An account with any ledger history is not
    // hard-deletable; it would be deactivated instead. Only a truly unused bank
    // (no movements ever) can be removed, mirror and all.
    const [mirror] = await tx.select({ id: accountsTable.id }).from(accountsTable).where(eq(accountsTable.legacyBankAccountId, id));
    if (mirror) {
      const [mov] = await tx.select({ id: financialMovementsTable.id }).from(financialMovementsTable).where(eq(financialMovementsTable.accountId, mirror.id)).limit(1);
      if (mov) return { conflict: "history" as const };
      await tx.delete(accountsTable).where(eq(accountsTable.id, mirror.id));
    }
    const [a] = await tx.delete(bankAccountsTable).where(eq(bankAccountsTable.id, id)).returning();
    return { deleted: a ?? null };
  });

  if ("conflict" in result) {
    const msg = result.conflict === "refs"
      ? "لا يمكن حذف الحساب البنكي لارتباطه بسندات أو شيكات"
      : "لا يمكن حذف الحساب البنكي لوجود حركات مالية مسجّلة عليه؛ يمكن إلغاء تفعيله بدلاً من حذفه";
    res.status(409).json({ error: msg });
    return;
  }
  if (!result.deleted) { res.status(404).json({ error: "Not found" }); return; }
  await logAction(user, "DELETE", "bank_account", result.deleted.id);
  res.sendStatus(204);
});

export default router;
