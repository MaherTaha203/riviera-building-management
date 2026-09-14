import { Router } from "express";
import { db, financialPeriodsTable } from "@workspace/db";
import { and, desc, eq, lte, gte } from "drizzle-orm";
import { authMiddleware, type JwtPayload } from "../lib/auth";
import { logAction } from "../lib/audit";
import { validateBody } from "../lib/validate";
import { CreateFinancialPeriodBody } from "@workspace/api-zod";
import { computeClosing, postClosingEntry, reverseClosingEntry } from "../lib/periodClose";

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

/** Preview the closing entry (income/expense → retained earnings) for a period. */
router.get("/financial-periods/:id/closing-preview", authMiddleware, async (req, res): Promise<void> => {
  const id = parseInt(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id, 10);
  const [p] = await db.select().from(financialPeriodsTable).where(eq(financialPeriodsTable.id, id));
  if (!p) { res.status(404).json({ error: "Not found" }); return; }
  res.json(await computeClosing(db, { id: p.id, endDate: p.endDate }));
});

/**
 * Close a period: post the closing entry (zeroing income/expense into retained
 * earnings, dated the period end) THEN freeze the period. Both in one tx so the
 * closing entry itself is posted while the period is still open.
 */
router.post("/financial-periods/:id/close", authMiddleware, async (req, res): Promise<void> => {
  const user = (req as typeof req & { user: JwtPayload }).user;
  const id = parseInt(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id, 10);
  const result = await db.transaction(async (tx) => {
    const [p] = await tx.select().from(financialPeriodsTable).where(eq(financialPeriodsTable.id, id));
    if (!p) return { notFound: true as const };
    if (p.status !== "closed") {
      await postClosingEntry(tx, { id: p.id, endDate: p.endDate }, user.userId);
    }
    const [updated] = await tx.update(financialPeriodsTable)
      .set({ status: "closed", closedBy: user.userId, closedAt: new Date() })
      .where(eq(financialPeriodsTable.id, id)).returning();
    return { updated };
  });
  if ("notFound" in result) { res.status(404).json({ error: "Not found" }); return; }
  await logAction(user, "UPDATE", "financial_period", id);
  res.json(shape(result.updated!));
});

/** Reopen a closed period: unfreeze it THEN reverse its closing entry. */
router.post("/financial-periods/:id/reopen", authMiddleware, async (req, res): Promise<void> => {
  const user = (req as typeof req & { user: JwtPayload }).user;
  const id = parseInt(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id, 10);
  const result = await db.transaction(async (tx) => {
    const [updated] = await tx.update(financialPeriodsTable)
      .set({ status: "open", closedBy: null, closedAt: null })
      .where(eq(financialPeriodsTable.id, id)).returning();
    if (!updated) return { notFound: true as const };
    await reverseClosingEntry(tx, id); // period is now open → reversal (dated end) allowed
    return { updated };
  });
  if ("notFound" in result) { res.status(404).json({ error: "Not found" }); return; }
  await logAction(user, "UPDATE", "financial_period", id);
  res.json(shape(result.updated!));
});

export default router;
