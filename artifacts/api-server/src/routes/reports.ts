// ---------------------------------------------------------------------------
// Financial reports (Phase 2) — read-only endpoints over the double-entry ledger.
//   GET /reports/trial-balance?asOf=YYYY-MM-DD  → per-account debit/credit + totals
// ---------------------------------------------------------------------------
import { Router } from "express";
import { db } from "@workspace/db";
import { authMiddleware } from "../lib/auth";
import { trialBalance, incomeStatement, balanceSheet, accountLedger, agingReport } from "../lib/reports";

const router = Router();

const asOfParam = (v: unknown): string | undefined => {
  const s = typeof v === "string" ? v.trim() : "";
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : undefined;
};

/** Trial balance: every account's balance in standard debit/credit columns. */
router.get("/reports/trial-balance", authMiddleware, async (req, res): Promise<void> => {
  res.json(await trialBalance(db, asOfParam(req.query.asOf)));
});

/** Income statement (revenue − expenses) over an optional [from, to] window. */
router.get("/reports/income-statement", authMiddleware, async (req, res): Promise<void> => {
  res.json(await incomeStatement(db, asOfParam(req.query.from), asOfParam(req.query.to)));
});

/** Balance sheet as of a date (assets = liabilities + equity + net income). */
router.get("/reports/balance-sheet", authMiddleware, async (req, res): Promise<void> => {
  res.json(await balanceSheet(db, asOfParam(req.query.asOf)));
});

/** Statement of one account: its movements with a running balance. */
router.get("/reports/account-ledger", authMiddleware, async (req, res): Promise<void> => {
  const accountId = parseInt(req.query.accountId as string, 10);
  if (!accountId) { res.status(400).json({ error: "accountId is required" }); return; }
  const result = await accountLedger(db, accountId, asOfParam(req.query.from), asOfParam(req.query.to));
  if (!result) { res.status(404).json({ error: "Account not found" }); return; }
  res.json(result);
});

/** Receivables aging: per-tenant outstanding charges bucketed by days overdue. */
router.get("/reports/aging", authMiddleware, async (req, res): Promise<void> => {
  res.json(await agingReport(db, asOfParam(req.query.asOf)));
});

export default router;
