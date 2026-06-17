import { Router } from "express";
import { db, receiptVouchersTable, tenantsTable, contractsTable, unitsTable, bankAccountsTable } from "@workspace/db";
import { eq, sql } from "drizzle-orm";
import { authMiddleware, type JwtPayload } from "../lib/auth";
import { logAction } from "../lib/audit";
import { generateReceiptVoucherNumber } from "../lib/vouchers";
import { validateBody } from "../lib/validate";
import { CreateReceiptVoucherBody, UpdateReceiptVoucherBody } from "@workspace/api-zod";

const router = Router();

const toNum = (v: unknown) => v != null ? Number(v) : null;

router.get("/receipt-vouchers", authMiddleware, async (_req, res): Promise<void> => {
  const vouchers = await db.select().from(receiptVouchersTable).orderBy(sql`date desc, id desc`);
  const tenants = await db.select({ id: tenantsTable.id, name: tenantsTable.name }).from(tenantsTable);
  const contracts = await db.select({ id: contractsTable.id, contractNumber: contractsTable.contractNumber, unitId: contractsTable.unitId }).from(contractsTable);
  const units = await db.select({ id: unitsTable.id, unitNumber: unitsTable.unitNumber }).from(unitsTable);
  const tenantMap = Object.fromEntries(tenants.map(t => [t.id, t.name]));
  const contractMap = Object.fromEntries(contracts.map(c => [c.id, { number: c.contractNumber, unitId: c.unitId }]));
  const unitMap = Object.fromEntries(units.map(u => [u.id, u.unitNumber]));
  res.json(vouchers.map(v => ({
    ...v,
    amount: Number(v.amount),
    exchangeRate: Number(v.exchangeRate),
    amountILS: Number(v.amountILS),
    previousBalance: toNum(v.previousBalance),
    newBalance: toNum(v.newBalance),
    tenantName: v.tenantId ? tenantMap[v.tenantId] ?? null : null,
    contractNumber: v.contractId ? contractMap[v.contractId]?.number ?? null : null,
    unitNumber: v.contractId ? unitMap[contractMap[v.contractId]?.unitId ?? 0] ?? null : null,
  })));
});

router.post("/receipt-vouchers", authMiddleware, validateBody(CreateReceiptVoucherBody), async (req, res): Promise<void> => {
  const user = (req as typeof req & { user: JwtPayload }).user;
  const { date, payerName, tenantId, contractId, amount, currency, exchangeRate, amountILS, paymentMethod, chequeNumber, bankName, chequeDate, dueDate, accountHolderName, notes } = req.body;
  if (!date || !payerName || amount == null || !currency || !paymentMethod) {
    res.status(400).json({ error: "Missing required fields" });
    return;
  }
  // Atomically generate voucher number + insert + update tenant balance in one transaction.
  // pg_advisory_xact_lock inside generateReceiptVoucherNumber serializes concurrent callers.
  const voucher = await db.transaction(async (tx) => {
    const voucherNumber = await generateReceiptVoucherNumber(tx);
    let previousBalance: number | null = null;
    let newBalance: number | null = null;
    if (tenantId) {
      const [tenant] = await tx.select().from(tenantsTable).where(eq(tenantsTable.id, Number(tenantId)));
      if (tenant) {
        previousBalance = Number(tenant.balance);
        newBalance = previousBalance + Number(amountILS);
        await tx.update(tenantsTable).set({ balance: String(newBalance) }).where(eq(tenantsTable.id, Number(tenantId)));
      }
    }
    const [inserted] = await tx.insert(receiptVouchersTable).values({
      voucherNumber, date, payerName,
      tenantId: tenantId ? Number(tenantId) : null,
      contractId: contractId ? Number(contractId) : null,
      amount: String(amount), currency,
      exchangeRate: String(exchangeRate ?? 1),
      amountILS: String(amountILS),
      paymentMethod,
      chequeNumber: chequeNumber ?? null, bankName: bankName ?? null,
      chequeDate: chequeDate ?? null, dueDate: dueDate ?? null,
      accountHolderName: accountHolderName ?? null,
      previousBalance: previousBalance != null ? String(previousBalance) : null,
      newBalance: newBalance != null ? String(newBalance) : null,
      notes: notes ?? null,
    }).returning();
    return inserted;
  });
  // Sync bank account balance for bank_transfer
  if (paymentMethod === "bank_transfer" && bankName) {
    const [bankAccount] = await db.select().from(bankAccountsTable).where(eq(bankAccountsTable.bankName, bankName));
    if (bankAccount) {
      const newBal = Number(bankAccount.balanceILS) + Number(amountILS);
      await db.update(bankAccountsTable).set({ balanceILS: String(newBal) }).where(eq(bankAccountsTable.id, bankAccount.id));
    }
  }
  await logAction(user, "CREATE", "receipt_voucher", voucher.id);
  res.status(201).json({ ...voucher, amount: Number(voucher.amount), exchangeRate: Number(voucher.exchangeRate), amountILS: Number(voucher.amountILS), previousBalance: toNum(voucher.previousBalance), newBalance: toNum(voucher.newBalance) });
});

router.get("/receipt-vouchers/:id", authMiddleware, async (req, res): Promise<void> => {
  const id = parseInt(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id, 10);
  const [v] = await db.select().from(receiptVouchersTable).where(eq(receiptVouchersTable.id, id));
  if (!v) { res.status(404).json({ error: "Not found" }); return; }
  res.json({ ...v, amount: Number(v.amount), exchangeRate: Number(v.exchangeRate), amountILS: Number(v.amountILS), previousBalance: toNum(v.previousBalance), newBalance: toNum(v.newBalance) });
});

router.patch("/receipt-vouchers/:id", authMiddleware, validateBody(UpdateReceiptVoucherBody), async (req, res): Promise<void> => {
  const user = (req as typeof req & { user: JwtPayload }).user;
  const id = parseInt(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id, 10);

  // Atomically: fetch existing → compute tenant-balance delta → apply updates
  const v = await db.transaction(async (tx) => {
    const [existing] = await tx.select().from(receiptVouchersTable).where(eq(receiptVouchersTable.id, id));
    if (!existing) return null;

    const oldTenantId = existing.tenantId;
    const newTenantId = req.body.tenantId !== undefined
      ? (req.body.tenantId ? Number(req.body.tenantId) : null)
      : oldTenantId;
    const oldAmountILS = Number(existing.amountILS);
    const newAmountILS = req.body.amountILS != null ? Number(req.body.amountILS) : oldAmountILS;

    const oldBankName = existing.bankName;
    const oldMethod = existing.paymentMethod;
    const newBankName = req.body.bankName !== undefined ? req.body.bankName : oldBankName;
    const newMethod = req.body.paymentMethod ?? oldMethod;

    const tenantChanged = newTenantId !== oldTenantId;
    const amountChanged = newAmountILS !== oldAmountILS;
    const bankChanged = oldBankName !== newBankName || oldMethod !== newMethod;

    if (tenantChanged || amountChanged) {
      // Reverse the old tenant's balance for the old amount
      if (oldTenantId) {
        const [oldTenant] = await tx.select().from(tenantsTable).where(eq(tenantsTable.id, oldTenantId));
        if (oldTenant) {
          await tx.update(tenantsTable)
            .set({ balance: String(Number(oldTenant.balance) - oldAmountILS) })
            .where(eq(tenantsTable.id, oldTenantId));
        }
      }
      // Credit the new tenant's balance with the new amount
      if (newTenantId) {
        // Re-fetch if same tenant (balance just changed above)
        const [newTenant] = await tx.select().from(tenantsTable).where(eq(tenantsTable.id, newTenantId));
        if (newTenant) {
          await tx.update(tenantsTable)
            .set({ balance: String(Number(newTenant.balance) + newAmountILS) })
            .where(eq(tenantsTable.id, newTenantId));
        }
      }
    }

    if (amountChanged || bankChanged) {
      // Reverse old bank balance (subtract the old receipt amount)
      if (oldMethod === "bank_transfer" && oldBankName) {
        const [oldBa] = await tx.select().from(bankAccountsTable).where(eq(bankAccountsTable.bankName, oldBankName));
        if (oldBa) {
          await tx.update(bankAccountsTable)
            .set({ balanceILS: String(Number(oldBa.balanceILS) - oldAmountILS) })
            .where(eq(bankAccountsTable.id, oldBa.id));
        }
      }
      // Apply new bank balance (add the new receipt amount)
      if (newMethod === "bank_transfer" && newBankName) {
        const [newBa] = await tx.select().from(bankAccountsTable).where(eq(bankAccountsTable.bankName, newBankName as string));
        if (newBa) {
          await tx.update(bankAccountsTable)
            .set({ balanceILS: String(Number(newBa.balanceILS) + newAmountILS) })
            .where(eq(bankAccountsTable.id, newBa.id));
        }
      }
    }

    // Build the column update set
    const updates: Record<string, unknown> = {};
    if (req.body.tenantId !== undefined) updates.tenantId = newTenantId;
    if (req.body.contractId !== undefined) updates.contractId = req.body.contractId ? Number(req.body.contractId) : null;
    const scalarFields = ["date","payerName","amount","currency","exchangeRate","amountILS","paymentMethod","chequeNumber","bankName","chequeDate","dueDate","accountHolderName","notes"];
    for (const f of scalarFields) {
      if (req.body[f] !== undefined) {
        updates[f] = req.body[f] != null
          ? (["amount","exchangeRate","amountILS"].includes(f) ? String(req.body[f]) : req.body[f])
          : null;
      }
    }

    const [updated] = await tx.update(receiptVouchersTable).set(updates).where(eq(receiptVouchersTable.id, id)).returning();
    return updated ?? null;
  });

  if (!v) { res.status(404).json({ error: "Not found" }); return; }
  await logAction(user, "UPDATE", "receipt_voucher", v.id);
  res.json({ ...v, amount: Number(v.amount), exchangeRate: Number(v.exchangeRate), amountILS: Number(v.amountILS), previousBalance: toNum(v.previousBalance), newBalance: toNum(v.newBalance) });
});

router.delete("/receipt-vouchers/:id", authMiddleware, async (req, res): Promise<void> => {
  const user = (req as typeof req & { user: JwtPayload }).user;
  const id = parseInt(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id, 10);
  // Fetch voucher before deletion so we can reverse the tenant balance
  const [existing] = await db.select().from(receiptVouchersTable).where(eq(receiptVouchersTable.id, id));
  if (!existing) { res.status(404).json({ error: "Not found" }); return; }
  // Reverse tenant balance if this voucher was linked to a tenant
  if (existing.tenantId) {
    const [tenant] = await db.select().from(tenantsTable).where(eq(tenantsTable.id, existing.tenantId));
    if (tenant) {
      const reversed = Number(tenant.balance) - Number(existing.amountILS);
      await db.update(tenantsTable).set({ balance: String(reversed) }).where(eq(tenantsTable.id, existing.tenantId));
    }
  }
  // Reverse bank account balance for bank_transfer
  if (existing.paymentMethod === "bank_transfer" && existing.bankName) {
    const [bankAccount] = await db.select().from(bankAccountsTable).where(eq(bankAccountsTable.bankName, existing.bankName));
    if (bankAccount) {
      const newBal = Number(bankAccount.balanceILS) - Number(existing.amountILS);
      await db.update(bankAccountsTable).set({ balanceILS: String(newBal) }).where(eq(bankAccountsTable.id, bankAccount.id));
    }
  }
  await db.delete(receiptVouchersTable).where(eq(receiptVouchersTable.id, id));
  await logAction(user, "DELETE", "receipt_voucher", existing.id);
  res.sendStatus(204);
});

export default router;
