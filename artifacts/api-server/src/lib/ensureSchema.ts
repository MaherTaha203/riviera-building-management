import { pool } from "@workspace/db";
import { logger } from "./logger";

/**
 * Boot-time schema guard.
 *
 * Root cause fix for the production GET /api/contracts 500: the deploy
 * pipeline has no migration step, so schema changes pushed to the dev
 * database never reached the production database. Drizzle enumerates every
 * mapped column in its SELECTs, so a missing column crashes the whole route
 * (pg: column "deposit_amount" does not exist → 500).
 *
 * Every statement here MUST be idempotent (IF NOT EXISTS) and
 * backward-compatible (nullable columns only, no drops, no rewrites) so it
 * is safe to run on every boot against any environment, including
 * production with live data.
 */
const GUARD_STATEMENTS: string[] = [
  `ALTER TABLE contracts ADD COLUMN IF NOT EXISTS deposit_amount numeric(14,2)`,
  `ALTER TABLE contracts ADD COLUMN IF NOT EXISTS payment_count integer`,
  `ALTER TABLE contracts ADD COLUMN IF NOT EXISTS additional_terms text`,
  `ALTER TABLE contracts ADD COLUMN IF NOT EXISTS payment_method text`,
];

export async function ensureSchema(): Promise<void> {
  for (const sql of GUARD_STATEMENTS) {
    await pool.query(sql);
  }
  logger.info({ statements: GUARD_STATEMENTS.length }, "Schema guard applied (idempotent)");
}
