import { Router } from "express";
import { db, paymentVouchersTable, bankAccountsTable } from "@workspace/db";
import { eq, sql } from "drizzle-orm";
import { authMiddleware, type JwtPayload } from "../lib/auth";
import { logAction } from "../lib/audit";
import { generatePaymentVoucherNumber } from "../lib/vouchers";
import { validateBody } from "../lib/validate";
import { CreatePaymentVoucherBody, UpdatePaymentVoucherBody } from "@workspace/api-zod";

const router = Router();

router.get("/payment-vouchers", authMiddleware, async (_req, res): Promise<void> => {
  const vouchers = await db.select().from(paymentVouchersTable).orderBy(sql`date desc, id desc`);
  res.json(vouchers.map(v => ({ ...v, amount: Number(v.amount), exchangeRate: Number(v.exchangeRate), amountILS: Number(v.amountILS) })));
});

router.post("/payment-vouchers", authMiddleware, validateBody(CreatePaymentVoucherBody), async (req, res): Promise<void> => {
  const user = (req as typeof req & { user: JwtPayload }).user;
  const { date, beneficiaryName, amount, currency, exchangeRate, amountILS, paymentMethod, category, chequeNumber, bankName, chequeDate, dueDate, notes } = req.body;
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
      chequeNumber: chequeNumber ?? null, bankName: bankName ?? null,
      chequeDate: chequeDate ?? null, dueDate: dueDate ?? null,
      notes: notes ?? null,
    }).returning();
    return inserted;
  });
  // Sync bank account balance for bank_transfer (payment reduces bank balance)
  if (paymentMethod === "bank_transfer" && bankName) {
    const [bankAccount] = await db.select().from(bankAccountsTable).where(eq(bankAccountsTable.bankName, bankName));
    if (bankAccount) {
      // Atomic decrement — safe under concurrency (no read-modify-write race).
      await db.update(bankAccountsTable).set({ balanceILS: sql`${bankAccountsTable.balanceILS} - ${Number(amountILS)}` }).where(eq(bankAccountsTable.id, bankAccount.id));
    }
  }
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
    const newBankName = req.body.bankName !== undefined ? req.body.bankName : oldBankName;
    const newAmountILS = req.body.amountILS != null ? Number(req.body.amountILS) : oldAmountILS;
    const newMethod = req.body.paymentMethod ?? oldMethod;

    const oldWasBank = oldMethod === "bank_transfer" && oldBankName;
    const newIsBank = newMethod === "bank_transfer" && newBankName;
    const changed = oldBankName !== newBankName || newAmountILS !== oldAmountILS || oldMethod !== newMethod;

    if (changed) {
      // Add back the old amount to the old bank (reverse the debit)
      if (oldWasBank) {
        const [oldBa] = await tx.select().from(bankAccountsTable).where(eq(bankAccountsTable.bankName, oldBankName!));
        if (oldBa) {
          await tx.update(bankAccountsTable)
            .set({ balanceILS: sql`${bankAccountsTable.balanceILS} + ${oldAmountILS}` })
            .where(eq(bankAccountsTable.id, oldBa.id));
        }
      }
      // Deduct the new amount from the new bank
      if (newIsBank) {
        const [newBa] = await tx.select().from(bankAccountsTable).where(eq(bankAccountsTable.bankName, newBankName as string));
        if (newBa) {
          await tx.update(bankAccountsTable)
            .set({ balanceILS: sql`${bankAccountsTable.balanceILS} - ${newAmountILS}` })
            .where(eq(bankAccountsTable.id, newBa.id));
        }
      }
    }

    const updates: Record<string, unknown> = {};
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
  // Fetch before delete so we can reverse the bank account balance
  const [existing] = await db.select().from(paymentVouchersTable).where(eq(paymentVouchersTable.id, id));
  if (!existing) { res.status(404).json({ error: "Not found" }); return; }
  // Reverse bank account balance for bank_transfer (add back the amount)
  if (existing.paymentMethod === "bank_transfer" && existing.bankName) {
    const [bankAccount] = await db.select().from(bankAccountsTable).where(eq(bankAccountsTable.bankName, existing.bankName));
    if (bankAccount) {
      await db.update(bankAccountsTable).set({ balanceILS: sql`${bankAccountsTable.balanceILS} + ${Number(existing.amountILS)}` }).where(eq(bankAccountsTable.id, bankAccount.id));
    }
  }
  await db.delete(paymentVouchersTable).where(eq(paymentVouchersTable.id, id));
  await logAction(user, "DELETE", "payment_voucher", existing.id);
  res.sendStatus(204);
});

export default router;
