import { Router } from "express";
import { db, auditLogTable } from "@workspace/db";
import { sql } from "drizzle-orm";
import { authMiddleware } from "../lib/auth";

const router = Router();

router.get("/audit-log", authMiddleware, async (req, res): Promise<void> => {
  const page = parseInt(req.query.page as string ?? "1", 10);
  const limit = parseInt(req.query.limit as string ?? "50", 10);
  const offset = (page - 1) * limit;

  const [countRow] = await db.select({ count: sql<number>`count(*)` }).from(auditLogTable);
  const entries = await db.select().from(auditLogTable).orderBy(sql`created_at desc`).limit(limit).offset(offset);

  res.json({ entries, total: Number(countRow.count), page, limit });
});

export default router;
