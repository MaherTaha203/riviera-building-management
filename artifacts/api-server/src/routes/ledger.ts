// ---------------------------------------------------------------------------
// Ledger read endpoints (Phase 1, slice 9). Read-only windows onto the
// financial_movements ledger and its agreement with the legacy balances.
//
//   GET /ledger/accounts   → every unified account with its projected balance
//   GET /ledger/reconcile  → per-account legacy-vs-ledger comparison (+ cash)
//
// These do NOT change any figure the app already shows — they run alongside the
// legacy paths and prove the two agree, in production, before any read-cutover.
// ---------------------------------------------------------------------------
import { Router } from "express";
import { db, accountsTable, bankAccountsTable, receiptVouchersTable, paymentVouchersTable } from "@workspace/db";
import { eq, sql } from "drizzle-orm";
import { authMiddleware } from "../lib/auth";
import { accountBalanceILS, allAccountBalancesILS } from "../lib/ledger";
import { resolveCashAccountId } from "../lib/accounts";

const router = Router();

/** Every unified account with its authoritative ledger-projected balance. */
router.get("/ledger/accounts", authMiddleware, async (_req, res): Promise<void> => {
  const rows = await allAccountBalancesILS(db);
  res.json(rows);
});

/**
 * Per-account reconciliation: the legacy balance vs the ledger projection, with
 * the delta and a match flag. `ok` is true when every line agrees (within a
 * cent). This is the production-visible proof the ledger mirrors the legacy
 * figures — the same invariant the CI smoke checks locally.
 */
router.get("/ledger/reconcile", authMiddleware, async (_req, res): Promise<void> => {
  const near = (a: number, b: number) => Math.abs(a - b) < 0.005;
  const lines: Array<{
    scope: string; accountId: number | null; name: string;
    legacyILS: number; ledgerILS: number; deltaILS: number; match: boolean;
  }> = [];

  // Cash: legacy = Σ cash receipts − Σ cash payments; ledger = cash account.
  const [cashIn] = await db.select({ t: sql<string>`coalesce(sum(amount_ils),0)` }).from(receiptVouchersTable).where(eq(receiptVouchersTable.paymentMethod, "cash"));
  const [cashOut] = await db.select({ t: sql<string>`coalesce(sum(amount_ils),0)` }).from(paymentVouchersTable).where(eq(paymentVouchersTable.paymentMethod, "cash"));
  const cashLegacy = Number(cashIn.t) - Number(cashOut.t);
  const cashAccId = await resolveCashAccountId(db);
  const cashLedger = cashAccId != null ? await accountBalanceILS(db, cashAccId) : 0;
  lines.push({ scope: "cash", accountId: cashAccId, name: "الصندوق", legacyILS: cashLegacy, ledgerILS: cashLedger, deltaILS: cashLedger - cashLegacy, match: near(cashLegacy, cashLedger) });

  // Banks: legacy = stored balance_ils; ledger = the mirror account projection.
  const banks = await db.select().from(bankAccountsTable).orderBy(bankAccountsTable.id);
  for (const b of banks) {
    const [mirror] = await db.select({ id: accountsTable.id }).from(accountsTable).where(eq(accountsTable.legacyBankAccountId, b.id));
    const legacy = Number(b.balanceILS);
    const ledger = mirror ? await accountBalanceILS(db, mirror.id) : 0;
    lines.push({
      scope: "bank", accountId: mirror?.id ?? null, name: `${b.bankName} — ${b.accountName}`,
      legacyILS: legacy, ledgerILS: ledger, deltaILS: ledger - legacy, match: mirror ? near(legacy, ledger) : false,
    });
  }

  res.json({ ok: lines.every((l) => l.match), checkedAt: new Date().toISOString(), lines });
});

export default router;
