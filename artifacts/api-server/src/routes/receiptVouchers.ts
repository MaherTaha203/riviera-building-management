import { Router } from "express";
import { db, receiptVouchersTable, tenantsTable, contractsTable, unitsTable } from "@workspace/db";
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
  const voucherNumber = await generateReceiptVoucherNumber();
  // Update tenant balance
  let previousBalance: number | null = null;
  let newBalance: number | null = null;
  if (tenantId) {
    const [tenant] = await db.select().from(tenantsTable).where(eq(tenantsTable.id, Number(tenantId)));
    if (tenant) {
      previousBalance = Number(tenant.balance);
      newBalance = previousBalance + Number(amountILS);
      await db.update(tenantsTable).set({ balance: String(newBalance) }).where(eq(tenantsTable.id, Number(tenantId)));
    }
  }
  const [voucher] = await db.insert(receiptVouchersTable).values({
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
  const updates: Record<string, unknown> = {};
  const fields = ["date","payerName","amount","currency","exchangeRate","amountILS","paymentMethod","chequeNumber","bankName","chequeDate","dueDate","accountHolderName","notes"];
  for (const f of fields) { if (req.body[f] !== undefined) updates[f] = req.body[f] != null ? (["amount","exchangeRate","amountILS"].includes(f) ? String(req.body[f]) : req.body[f]) : null; }
  const [v] = await db.update(receiptVouchersTable).set(updates).where(eq(receiptVouchersTable.id, id)).returning();
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
  await db.delete(receiptVouchersTable).where(eq(receiptVouchersTable.id, id));
  await logAction(user, "DELETE", "receipt_voucher", existing.id);
  res.sendStatus(204);
});

export default router;
