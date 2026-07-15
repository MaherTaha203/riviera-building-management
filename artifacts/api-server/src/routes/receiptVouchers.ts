import { Router } from "express";
import { db, receiptVouchersTable, tenantsTable, contractsTable, unitsTable } from "@workspace/db";
import { eq, sql } from "drizzle-orm";
import { authMiddleware, type JwtPayload } from "../lib/auth";
import { logAction } from "../lib/audit";
import { generateReceiptVoucherNumber } from "../lib/vouchers";
import { applyBankDelta } from "../lib/bank";
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
  const { date, payerName, tenantId, contractId, amount, currency, exchangeRate, amountILS, paymentMethod, bankAccountId, chequeNumber, bankName, chequeDate, dueDate, accountHolderName, notes } = req.body;
  if (!date || !payerName || amount == null || !currency || !paymentMethod) {
    res.status(400).json({ error: "Missing required fields" });
    return;
  }
  // Referential integrity: a linked tenant/contract must exist, otherwise the voucher
  // dangles and skews the tenant balance / account statement it should belong to.
  if (tenantId) {
    const [tenantRef] = await db.select({ id: tenantsTable.id }).from(tenantsTable).where(eq(tenantsTable.id, Number(tenantId)));
    if (!tenantRef) { res.status(400).json({ error: "Tenant not found" }); return; }
  }
  if (contractId) {
    const [contractRef] = await db.select({ id: contractsTable.id }).from(contractsTable).where(eq(contractsTable.id, Number(contractId)));
    if (!contractRef) { res.status(400).json({ error: "Contract not found" }); return; }
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
        // Atomic increment (col = col + delta) — safe under concurrency, no lost updates.
        await tx.update(tenantsTable).set({ balance: sql`${tenantsTable.balance} + ${Number(amountILS)}` }).where(eq(tenantsTable.id, Number(tenantId)));
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
      bankAccountId: bankAccountId != null ? Number(bankAccountId) : null,
      chequeNumber: chequeNumber ?? null, bankName: bankName ?? null,
      chequeDate: chequeDate ?? null, dueDate: dueDate ?? null,
      accountHolderName: accountHolderName ?? null,
      previousBalance: previousBalance != null ? String(previousBalance) : null,
      newBalance: newBalance != null ? String(newBalance) : null,
      notes: notes ?? null,
    }).returning();
    // Bank balance: a bank_transfer receipt credits the chosen account (by id).
    if (paymentMethod === "bank_transfer") {
      await applyBankDelta(tx, { bankAccountId: bankAccountId != null ? Number(bankAccountId) : null, bankName }, Number(amountILS));
    }
    return inserted;
  });
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
    const oldBankAccountId = existing.bankAccountId;
    const newBankName = req.body.bankName !== undefined ? req.body.bankName : oldBankName;
    const newMethod = req.body.paymentMethod ?? oldMethod;
    const newBankAccountId = req.body.bankAccountId !== undefined
      ? (req.body.bankAccountId != null ? Number(req.body.bankAccountId) : null)
      : oldBankAccountId;

    const tenantChanged = newTenantId !== oldTenantId;
    const amountChanged = newAmountILS !== oldAmountILS;
    const bankChanged = oldBankAccountId !== newBankAccountId || oldBankName !== newBankName || oldMethod !== newMethod;

    if (tenantChanged || amountChanged) {
      // Reverse the old tenant's balance for the old amount
      if (oldTenantId) {
        const [oldTenant] = await tx.select().from(tenantsTable).where(eq(tenantsTable.id, oldTenantId));
        if (oldTenant) {
          await tx.update(tenantsTable)
            .set({ balance: sql`${tenantsTable.balance} - ${oldAmountILS}` })
            .where(eq(tenantsTable.id, oldTenantId));
        }
      }
      // Credit the new tenant's balance with the new amount
      if (newTenantId) {
        // Re-fetch if same tenant (balance just changed above)
        const [newTenant] = await tx.select().from(tenantsTable).where(eq(tenantsTable.id, newTenantId));
        if (newTenant) {
          await tx.update(tenantsTable)
            .set({ balance: sql`${tenantsTable.balance} + ${newAmountILS}` })
            .where(eq(tenantsTable.id, newTenantId));
        }
      }
    }

    if (amountChanged || bankChanged) {
      // Reverse the old account's credit, then apply the new one — keyed by
      // bank_account_id (name only as a legacy fallback inside applyBankDelta).
      if (oldMethod === "bank_transfer") {
        await applyBankDelta(tx, { bankAccountId: oldBankAccountId, bankName: oldBankName }, -oldAmountILS);
      }
      if (newMethod === "bank_transfer") {
        await applyBankDelta(tx, { bankAccountId: newBankAccountId, bankName: newBankName }, newAmountILS);
      }
    }

    // Build the column update set
    const updates: Record<string, unknown> = {};
    if (req.body.tenantId !== undefined) updates.tenantId = newTenantId;
    if (req.body.contractId !== undefined) updates.contractId = req.body.contractId ? Number(req.body.contractId) : null;
    if (req.body.bankAccountId !== undefined) updates.bankAccountId = newBankAccountId;
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
  // Fetch, reverse the tenant + bank balances, and delete — all atomically.
  const existing = await db.transaction(async (tx) => {
    const [row] = await tx.select().from(receiptVouchersTable).where(eq(receiptVouchersTable.id, id));
    if (!row) return null;
    if (row.tenantId) {
      await tx.update(tenantsTable).set({ balance: sql`${tenantsTable.balance} - ${Number(row.amountILS)}` }).where(eq(tenantsTable.id, row.tenantId));
    }
    if (row.paymentMethod === "bank_transfer") {
      await applyBankDelta(tx, { bankAccountId: row.bankAccountId, bankName: row.bankName }, -Number(row.amountILS));
    }
    await tx.delete(receiptVouchersTable).where(eq(receiptVouchersTable.id, id));
    return row;
  });
  if (!existing) { res.status(404).json({ error: "Not found" }); return; }
  await logAction(user, "DELETE", "receipt_voucher", existing.id);
  res.sendStatus(204);
});

export default router;
