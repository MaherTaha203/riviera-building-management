// ---------------------------------------------------------------------------
// Financial reports (Phase 2) — read-only endpoints over the double-entry ledger.
//   GET /reports/trial-balance?asOf=YYYY-MM-DD  → per-account debit/credit + totals
// ---------------------------------------------------------------------------
import { Router } from "express";
import { db } from "@workspace/db";
import { authMiddleware } from "../lib/auth";
import { trialBalance } from "../lib/reports";

const router = Router();

const asOfParam = (v: unknown): string | undefined => {
  const s = typeof v === "string" ? v.trim() : "";
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : undefined;
};

/** Trial balance: every account's balance in standard debit/credit columns. */
router.get("/reports/trial-balance", authMiddleware, async (req, res): Promise<void> => {
  res.json(await trialBalance(db, asOfParam(req.query.asOf)));
});

export default router;
