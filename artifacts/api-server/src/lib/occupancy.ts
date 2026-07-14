// ---------------------------------------------------------------------------
// Unit occupancy — derived from contracts (Phase A of the financial-linkage
// remediation).
//
// Occupancy is NOT an independently-editable field: a unit is "occupied" iff it
// has an active contract. Previously the contract routes poked units.status
// with ad-hoc updates that drifted — ending a contract via a status change left
// the unit "occupied" forever, and deleting one contract blindly set the unit
// "vacant" even when another active contract still referenced it. This module
// makes contracts the single source of truth and keeps the denormalized
// units.status column in lockstep, so the dashboard's occupancy counts can
// never drift again (invariant I1, guarded by scripts/reconcile-units).
// ---------------------------------------------------------------------------
import { db, contractsTable, unitsTable } from "@workspace/db";
import { and, eq, sql } from "drizzle-orm";

// The transaction client type — the callback arg of db.transaction().
type TxClient = Parameters<Parameters<typeof db.transaction>[0]>[0];

/**
 * Pure decision (exhaustively unit-tested): given whether a unit has any ACTIVE
 * contract and its current stored status, return the status it SHOULD have.
 *
 *   • An active contract always means "occupied".
 *   • With no active contract the unit is "vacant" — UNLESS an admin has parked
 *     it in "maintenance", a manual hold we never auto-clear.
 *
 * So the invariant is exactly:  status == "occupied"  ⟺  ∃ active contract.
 * Units with no active contract are "vacant" or (by manual choice) "maintenance".
 */
export function decideUnitStatus(hasActive: boolean, current: string): string {
  if (hasActive) return "occupied";
  return current === "maintenance" ? "maintenance" : "vacant";
}

/**
 * Recompute and persist one unit's occupancy from its contracts, inside the
 * caller's transaction. No-op write when the status is already correct. Safe to
 * call from every contract mutation (create / status change / delete).
 */
export async function syncUnitStatus(tx: TxClient, unitId: number): Promise<void> {
  const [c] = await tx
    .select({ n: sql<number>`count(*)` })
    .from(contractsTable)
    .where(and(eq(contractsTable.unitId, unitId), eq(contractsTable.status, "active")));
  const hasActive = Number(c?.n ?? 0) > 0;

  const [unit] = await tx
    .select({ status: unitsTable.status })
    .from(unitsTable)
    .where(eq(unitsTable.id, unitId));
  if (!unit) return; // unit was deleted concurrently — nothing to sync

  const next = decideUnitStatus(hasActive, unit.status);
  if (next !== unit.status) {
    await tx.update(unitsTable).set({ status: next }).where(eq(unitsTable.id, unitId));
  }
}
