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
import { accountBalanceILS, allAccountBalancesILS, accountTransferDeltaILS } from "../lib/ledger";
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
    legacyILS: number; ledgerILS: number; transferDeltaILS: number; deltaILS: number; match: boolean;
  }> = [];

  // The legacy figures cannot represent account-to-account transfers, so the
  // comparison uses the ledger balance with transfer legs netted out — keeping
  // this a true "vouchers/cheques dual-write is consistent" check.
  const line = async (scope: string, accountId: number | null, name: string, legacy: number, hasMirror: boolean) => {
    const ledger = accountId != null ? await accountBalanceILS(db, accountId) : 0;
    const transferDelta = accountId != null ? await accountTransferDeltaILS(db, accountId) : 0;
    const ledgerExclTransfers = ledger - transferDelta;
    lines.push({
      scope, accountId, name, legacyILS: legacy, ledgerILS: ledger,
      transferDeltaILS: transferDelta, deltaILS: ledgerExclTransfers - legacy,
      match: hasMirror ? near(legacy, ledgerExclTransfers) : false,
    });
  };

  // Cash: legacy = Σ cash receipts − Σ cash payments; ledger = cash account.
  const [cashIn] = await db.select({ t: sql<string>`coalesce(sum(amount_ils),0)` }).from(receiptVouchersTable).where(eq(receiptVouchersTable.paymentMethod, "cash"));
  const [cashOut] = await db.select({ t: sql<string>`coalesce(sum(amount_ils),0)` }).from(paymentVouchersTable).where(eq(paymentVouchersTable.paymentMethod, "cash"));
  const cashAccId = await resolveCashAccountId(db);
  await line("cash", cashAccId, "الصندوق", Number(cashIn.t) - Number(cashOut.t), cashAccId != null);

  // Banks: legacy = stored balance_ils; ledger = the mirror account projection.
  const banks = await db.select().from(bankAccountsTable).orderBy(bankAccountsTable.id);
  for (const b of banks) {
    const [mirror] = await db.select({ id: accountsTable.id }).from(accountsTable).where(eq(accountsTable.legacyBankAccountId, b.id));
    await line("bank", mirror?.id ?? null, `${b.bankName} — ${b.accountName}`, Number(b.balanceILS), !!mirror);
  }

  res.json({ ok: lines.every((l) => l.match), checkedAt: new Date().toISOString(), lines });
});

export default router;
