import { Router } from "express";
import { db, paymentVouchersTable } from "@workspace/db";
import { eq, sql } from "drizzle-orm";
import { authMiddleware, type JwtPayload } from "../lib/auth";
import { logAction } from "../lib/audit";
import { generatePaymentVoucherNumber } from "../lib/vouchers";
import { applyBankDelta } from "../lib/bank";
import { validateBody } from "../lib/validate";
import { CreatePaymentVoucherBody, UpdatePaymentVoucherBody } from "@workspace/api-zod";

const router = Router();

router.get("/payment-vouchers", authMiddleware, async (_req, res): Promise<void> => {
  const vouchers = await db.select().from(paymentVouchersTable).orderBy(sql`date desc, id desc`);
  res.json(vouchers.map(v => ({ ...v, amount: Number(v.amount), exchangeRate: Number(v.exchangeRate), amountILS: Number(v.amountILS) })));
});

router.post("/payment-vouchers", authMiddleware, validateBody(CreatePaymentVoucherBody), async (req, res): Promise<void> => {
  const user = (req as typeof req & { user: JwtPayload }).user;
  const { date, beneficiaryName, amount, currency, exchangeRate, amountILS, paymentMethod, category, bankAccountId, chequeNumber, bankName, chequeDate, dueDate, notes } = req.body;
  if (!date || !beneficiaryName || amount == null || !currency || !paymentMethod || !category) {
    res.status(400).json({ error: "Missing required fields" });
    return;
  }
  // Atomically generate voucher number + insert in one transaction.
  // pg_advisory_xact_lock inside generatePaymentVoucherNumber serializes concurrent callers.
  const voucher = await db.transaction(async (tx) => {
    const voucherNumber = await generatePaymentVoucherNumber(tx);
    const [inserted] = await tx.insert(paymentVouchersTable).values({
      voucherNumber, date, beneficiaryName,
      amount: String(amount), currency, exchangeRate: String(exchangeRate ?? 1), amountILS: String(amountILS),
      paymentMethod, category,
      bankAccountId: bankAccountId != null ? Number(bankAccountId) : null,
      chequeNumber: chequeNumber ?? null, bankName: bankName ?? null,
      chequeDate: chequeDate ?? null, dueDate: dueDate ?? null,
      notes: notes ?? null,
    }).returning();
    // Bank balance: a bank_transfer payment debits the chosen account (by id).
    if (paymentMethod === "bank_transfer") {
      await applyBankDelta(tx, { bankAccountId: bankAccountId != null ? Number(bankAccountId) : null, bankName }, -Number(amountILS));
    }
    return inserted;
  });
  await logAction(user, "CREATE", "payment_voucher", voucher.id);
  res.status(201).json({ ...voucher, amount: Number(voucher.amount), exchangeRate: Number(voucher.exchangeRate), amountILS: Number(voucher.amountILS) });
});

router.get("/payment-vouchers/:id", authMiddleware, async (req, res): Promise<void> => {
  const id = parseInt(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id, 10);
  const [v] = await db.select().from(paymentVouchersTable).where(eq(paymentVouchersTable.id, id));
  if (!v) { res.status(404).json({ error: "Not found" }); return; }
  res.json({ ...v, amount: Number(v.amount), exchangeRate: Number(v.exchangeRate), amountILS: Number(v.amountILS) });
});

router.patch("/payment-vouchers/:id", authMiddleware, validateBody(UpdatePaymentVoucherBody), async (req, res): Promise<void> => {
  const user = (req as typeof req & { user: JwtPayload }).user;
  const id = parseInt(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id, 10);

  // Atomically: fetch existing → reverse old bank balance → apply new → update record
  const v = await db.transaction(async (tx) => {
    const [existing] = await tx.select().from(paymentVouchersTable).where(eq(paymentVouchersTable.id, id));
    if (!existing) return null;

    const oldBankName = existing.bankName;
    const oldAmountILS = Number(existing.amountILS);
    const oldMethod = existing.paymentMethod;
    const oldBankAccountId = existing.bankAccountId;
    const newBankName = req.body.bankName !== undefined ? req.body.bankName : oldBankName;
    const newAmountILS = req.body.amountILS != null ? Number(req.body.amountILS) : oldAmountILS;
    const newMethod = req.body.paymentMethod ?? oldMethod;
    const newBankAccountId = req.body.bankAccountId !== undefined
      ? (req.body.bankAccountId != null ? Number(req.body.bankAccountId) : null)
      : oldBankAccountId;

    const changed = oldBankAccountId !== newBankAccountId || oldBankName !== newBankName || newAmountILS !== oldAmountILS || oldMethod !== newMethod;

    if (changed) {
      // Reverse the old account's debit (add back), then apply the new debit —
      // keyed by bank_account_id (name only as a legacy fallback).
      if (oldMethod === "bank_transfer") {
        await applyBankDelta(tx, { bankAccountId: oldBankAccountId, bankName: oldBankName }, oldAmountILS);
      }
      if (newMethod === "bank_transfer") {
        await applyBankDelta(tx, { bankAccountId: newBankAccountId, bankName: newBankName }, -newAmountILS);
      }
    }

    const updates: Record<string, unknown> = {};
    if (req.body.bankAccountId !== undefined) updates.bankAccountId = newBankAccountId;
    const fields = ["date","beneficiaryName","amount","currency","exchangeRate","amountILS","paymentMethod","category","chequeNumber","bankName","chequeDate","dueDate","notes"];
    for (const f of fields) {
      if (req.body[f] !== undefined) {
        updates[f] = req.body[f] != null
          ? (["amount","exchangeRate","amountILS"].includes(f) ? String(req.body[f]) : req.body[f])
          : null;
      }
    }
    const [updated] = await tx.update(paymentVouchersTable).set(updates).where(eq(paymentVouchersTable.id, id)).returning();
    return updated ?? null;
  });

  if (!v) { res.status(404).json({ error: "Not found" }); return; }
  await logAction(user, "UPDATE", "payment_voucher", v.id);
  res.json({ ...v, amount: Number(v.amount), exchangeRate: Number(v.exchangeRate), amountILS: Number(v.amountILS) });
});

router.delete("/payment-vouchers/:id", authMiddleware, async (req, res): Promise<void> => {
  const user = (req as typeof req & { user: JwtPayload }).user;
  const id = parseInt(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id, 10);
  // Fetch, reverse the bank debit (add back), and delete — all atomically.
  const existing = await db.transaction(async (tx) => {
    const [row] = await tx.select().from(paymentVouchersTable).where(eq(paymentVouchersTable.id, id));
    if (!row) return null;
    if (row.paymentMethod === "bank_transfer") {
      await applyBankDelta(tx, { bankAccountId: row.bankAccountId, bankName: row.bankName }, Number(row.amountILS));
    }
    await tx.delete(paymentVouchersTable).where(eq(paymentVouchersTable.id, id));
    return row;
  });
  if (!existing) { res.status(404).json({ error: "Not found" }); return; }
  await logAction(user, "DELETE", "payment_voucher", existing.id);
  res.sendStatus(204);
});

export default router;
