import { Router } from "express";
import { db, financialPeriodsTable } from "@workspace/db";
import { and, desc, eq, lte, gte } from "drizzle-orm";
import { authMiddleware, type JwtPayload } from "../lib/auth";
import { logAction } from "../lib/audit";
import { validateBody } from "../lib/validate";
import { CreateFinancialPeriodBody } from "@workspace/api-zod";

const router = Router();

const shape = (p: typeof financialPeriodsTable.$inferSelect) => ({
  id: p.id, label: p.label, startDate: p.startDate, endDate: p.endDate,
  status: p.status, closedAt: p.closedAt ? new Date(p.closedAt).toISOString() : null,
  createdAt: new Date(p.createdAt).toISOString(),
});

/** List financial periods, newest first. */
router.get("/financial-periods", authMiddleware, async (_req, res): Promise<void> => {
  const rows = await db.select().from(financialPeriodsTable).orderBy(desc(financialPeriodsTable.startDate));
  res.json(rows.map(shape));
});

/** Create (open) a period. Rejects an invalid range or one overlapping another. */
router.post("/financial-periods", authMiddleware, validateBody(CreateFinancialPeriodBody), async (req, res): Promise<void> => {
  const user = (req as typeof req & { user: JwtPayload }).user;
  const { label, startDate, endDate } = req.body;
  if (!label || !startDate || !endDate) { res.status(400).json({ error: "Missing required fields" }); return; }
  if (startDate > endDate) { res.status(400).json({ error: "تاريخ البداية بعد تاريخ النهاية" }); return; }
  // Overlap: an existing period whose range intersects [startDate, endDate].
  const [clash] = await db.select({ id: financialPeriodsTable.id, label: financialPeriodsTable.label })
    .from(financialPeriodsTable)
    .where(and(lte(financialPeriodsTable.startDate, endDate), gte(financialPeriodsTable.endDate, startDate)))
    .limit(1);
  if (clash) { res.status(409).json({ error: `الفترة تتداخل مع فترة قائمة «${clash.label}»` }); return; }

  const [created] = await db.insert(financialPeriodsTable).values({ label, startDate, endDate, status: "open" }).returning();
  await logAction(user, "CREATE", "financial_period", created.id);
  res.status(201).json(shape(created));
});

/** Close a period: freezes posting/editing of any document dated within it. */
router.post("/financial-periods/:id/close", authMiddleware, async (req, res): Promise<void> => {
  const user = (req as typeof req & { user: JwtPayload }).user;
  const id = parseInt(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id, 10);
  const [updated] = await db.update(financialPeriodsTable)
    .set({ status: "closed", closedBy: user.userId, closedAt: new Date() })
    .where(eq(financialPeriodsTable.id, id)).returning();
  if (!updated) { res.status(404).json({ error: "Not found" }); return; }
  await logAction(user, "UPDATE", "financial_period", id);
  res.json(shape(updated));
});

/** Reopen a closed period (to correct historical entries). */
router.post("/financial-periods/:id/reopen", authMiddleware, async (req, res): Promise<void> => {
  const user = (req as typeof req & { user: JwtPayload }).user;
  const id = parseInt(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id, 10);
  const [updated] = await db.update(financialPeriodsTable)
    .set({ status: "open", closedBy: null, closedAt: null })
    .where(eq(financialPeriodsTable.id, id)).returning();
  if (!updated) { res.status(404).json({ error: "Not found" }); return; }
  await logAction(user, "UPDATE", "financial_period", id);
  res.json(shape(updated));
});

export default router;
