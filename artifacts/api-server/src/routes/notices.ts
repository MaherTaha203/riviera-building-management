// Notices / alerts (Phase 2, slice 10) — read-only operational alerts.
//   GET /notices?asOf=&expiryDays=  → expiring contracts + overdue tenants
import { Router } from "express";
import { db } from "@workspace/db";
import { authMiddleware } from "../lib/auth";
import { computeNotices } from "../lib/notices";

const router = Router();

router.get("/notices", authMiddleware, async (req, res): Promise<void> => {
  const asOf = typeof req.query.asOf === "string" && /^\d{4}-\d{2}-\d{2}$/.test(req.query.asOf) ? req.query.asOf : undefined;
  const n = req.query.expiryDays != null ? parseInt(req.query.expiryDays as string, 10) : undefined;
  const expiryHorizonDays = Number.isFinite(n) && (n as number) >= 0 ? n : undefined;
  res.json(await computeNotices(db, { asOf, expiryHorizonDays }));
});

export default router;
