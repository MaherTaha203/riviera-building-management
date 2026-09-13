import { Router } from "express";
import { db, receiptVouchersTable, paymentVouchersTable } from "@workspace/db";
import { eq, sql } from "drizzle-orm";
import { authMiddleware } from "../lib/auth";
import { accountBalanceILS, accountPostedMovementCount } from "../lib/ledger";
import { resolveCashAccountId } from "../lib/accounts";

const router = Router();

router.get("/cash-fund", authMiddleware, async (_req, res): Promise<void> => {
  // Read-cutover (Phase 1): the cash balance is now the ledger projection of the
  // main cash account — the authoritative source (freeze: balances are
  // projections). The legacy voucher-sum is kept as a self-guarding fallback:
  // until the cash account has any posted movement, we still trust the legacy
  // figure so a balance is never wrongly shown as zero.
  const [cashIn] = await db.select({ total: sql<number>`coalesce(sum(amount_ils), 0)` }).from(receiptVouchersTable).where(eq(receiptVouchersTable.paymentMethod, "cash"));
  const [cashOut] = await db.select({ total: sql<number>`coalesce(sum(amount_ils), 0)` }).from(paymentVouchersTable).where(eq(paymentVouchersTable.paymentMethod, "cash"));
  const legacy = Number(cashIn.total) - Number(cashOut.total);

  const cashAccId = await resolveCashAccountId(db);
  const balance = (cashAccId != null && (await accountPostedMovementCount(db, cashAccId)) > 0)
    ? await accountBalanceILS(db, cashAccId)
    : legacy;
  res.json({ balanceILS: balance, lastUpdated: new Date().toISOString() });
});

router.get("/cash-fund/transactions", authMiddleware, async (_req, res): Promise<void> => {
  const receipts = await db.select().from(receiptVouchersTable).where(eq(receiptVouchersTable.paymentMethod, "cash")).orderBy(sql`date asc, id asc`);
  const payments = await db.select().from(paymentVouchersTable).where(eq(paymentVouchersTable.paymentMethod, "cash")).orderBy(sql`date asc, id asc`);

  type Tx = { id: number; date: string; description: string; debit: number; credit: number; type: string; referenceId: number | null; referenceType: string | null };
  const txs: Tx[] = [
    ...receipts.map(r => ({ id: r.id, date: r.date, description: `قبض - ${r.payerName} - ${r.voucherNumber}`, debit: 0, credit: Number(r.amountILS), type: "receipt", referenceId: r.id, referenceType: "receipt_voucher" })),
    ...payments.map(p => ({ id: p.id + 1000000, date: p.date, description: `صرف - ${p.beneficiaryName} - ${p.voucherNumber}`, debit: Number(p.amountILS), credit: 0, type: "payment", referenceId: p.id, referenceType: "payment_voucher" })),
  ].sort((a, b) => a.date.localeCompare(b.date) || a.id - b.id);

  let balance = 0;
  const result = txs.map((tx, i) => {
    balance += tx.credit - tx.debit;
    return { id: i + 1, date: tx.date, description: tx.description, debit: tx.debit, credit: tx.credit, balance, type: tx.type, referenceId: tx.referenceId, referenceType: tx.referenceType };
  });
  res.json(result);
});

export default router;
