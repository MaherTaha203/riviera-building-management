// ---------------------------------------------------------------------------
// Receivables service (Phase 1, slice 10). Rent charges are ACCRUALS — what a
// tenant owes per rent period — tracked in rent_charges (not the cash/bank
// ledger, which stays money-only). A tenant receipt is applied to open charges
// FIFO (oldest first, freeze D2); the remainder is an unallocated credit.
//
//   tenant amount due = Σ (amount − allocated) over their non-cancelled charges
// ---------------------------------------------------------------------------
import { db, rentChargesTable, receiptAllocationsTable } from "@workspace/db";
import { and, eq, lte, ne, sql, asc } from "drizzle-orm";

type Exec = typeof db | Parameters<Parameters<typeof db.transaction>[0]>[0];

const round2 = (n: number) => Math.round(n * 100) / 100;

const FREQ_MONTHS: Record<string, number> = { monthly: 1, quarterly: 3, annually: 12 };

/** Add n months to a YYYY-MM-DD date (UTC), returning YYYY-MM-DD. */
export function addMonths(dateStr: string, n: number): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  const base = new Date(Date.UTC(y, m - 1, d));
  base.setUTCMonth(base.getUTCMonth() + n);
  return base.toISOString().slice(0, 10);
}

/** Add n days to a YYYY-MM-DD date (UTC), returning YYYY-MM-DD. */
export function addDays(dateStr: string, n: number): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  const base = new Date(Date.UTC(y, m - 1, d));
  base.setUTCDate(base.getUTCDate() + n);
  return base.toISOString().slice(0, 10);
}

interface ContractLike {
  id: number;
  tenantId: number;
  startDate: string;
  endDate: string;
  rentAmountILS: string | number;
  paymentFrequency: string;
  paymentCount?: number | null;
  status?: string;
}

/**
 * Generate rent charges for a contract, one per payment period, from its start
 * up to `upToDate` (and never past the contract end or its paymentCount). Each
 * charge is the contract's rent for that period. Idempotent: a period that
 * already has a charge is skipped (unique contract_id+period_start). Returns the
 * charges actually created.
 */
export async function generateChargesForContract(tx: Exec, contract: ContractLike, upToDate: string, createdBy?: number | null) {
  const freqMonths = FREQ_MONTHS[contract.paymentFrequency] ?? 1;
  const amount = String(contract.rentAmountILS);
  const maxCount = contract.paymentCount ?? Number.POSITIVE_INFINITY;
  const created: Array<typeof rentChargesTable.$inferSelect> = [];

  let periodStart = contract.startDate;
  let count = 0;
  while (periodStart <= upToDate && periodStart <= contract.endDate && count < maxCount) {
    const nextStart = addMonths(periodStart, freqMonths);
    let periodEnd = addDays(nextStart, -1);
    if (periodEnd > contract.endDate) periodEnd = contract.endDate;
    const [row] = await tx
      .insert(rentChargesTable)
      .values({
        contractId: contract.id,
        tenantId: contract.tenantId,
        periodStart,
        periodEnd,
        dueDate: periodStart,
        amountILS: amount,
        createdBy: createdBy ?? null,
      })
      .onConflictDoNothing({ target: [rentChargesTable.contractId, rentChargesTable.periodStart, rentChargesTable.kind] })
      .returning();
    if (row) created.push(row);
    periodStart = nextStart;
    count++;
  }
  return created;
}

/** Σ (amount − allocated) over a tenant's non-cancelled charges (what they owe). */
export async function tenantAmountDueILS(exec: Exec, tenantId: number): Promise<number> {
  const [row] = await exec
    .select({ due: sql<string>`coalesce(sum(${rentChargesTable.amountILS} - ${rentChargesTable.allocatedILS}), 0)` })
    .from(rentChargesTable)
    .where(and(eq(rentChargesTable.tenantId, tenantId), ne(rentChargesTable.status, "cancelled")));
  return Number(row?.due ?? 0);
}

/**
 * Apply a tenant receipt to open charges FIFO (oldest due first) up to
 * `amountILS`. Writes receipt_allocations and bumps each charge's allocated
 * amount + status. Returns the total allocated (≤ amountILS; the rest is an
 * unallocated credit). Must run in the caller's transaction.
 */
export async function allocateReceiptFIFO(
  tx: Exec,
  p: { receiptVoucherId: number; tenantId: number; amountILS: number | string },
): Promise<number> {
  let remaining = Number(p.amountILS);
  if (!(remaining > 0)) return 0;
  const open = await tx
    .select()
    .from(rentChargesTable)
    .where(and(eq(rentChargesTable.tenantId, p.tenantId), eq(rentChargesTable.status, "open")))
    .orderBy(asc(rentChargesTable.dueDate), asc(rentChargesTable.id));

  let allocated = 0;
  for (const charge of open) {
    if (remaining <= 0.005) break;
    const chargeRemaining = Number(charge.amountILS) - Number(charge.allocatedILS);
    if (chargeRemaining <= 0.005) continue;
    const alloc = Math.min(remaining, chargeRemaining);
    await tx.insert(receiptAllocationsTable).values({
      receiptVoucherId: p.receiptVoucherId,
      rentChargeId: charge.id,
      amountILS: alloc.toFixed(2),
    });
    const newAllocated = Number(charge.allocatedILS) + alloc;
    await tx.update(rentChargesTable).set({
      allocatedILS: newAllocated.toFixed(2),
      status: newAllocated >= Number(charge.amountILS) - 0.005 ? "settled" : "open",
    }).where(eq(rentChargesTable.id, charge.id));
    remaining -= alloc;
    allocated += alloc;
  }
  return allocated;
}

/**
 * Reverse every allocation a receipt made: subtract from each charge's allocated
 * amount, reopen it if no longer fully settled (never touching a cancelled
 * charge), and delete the allocation rows. Used before editing/deleting a
 * receipt so the FIFO application can be recomputed or removed cleanly.
 */
export async function deallocateReceipt(tx: Exec, receiptVoucherId: number): Promise<void> {
  const allocs = await tx.select().from(receiptAllocationsTable).where(eq(receiptAllocationsTable.receiptVoucherId, receiptVoucherId));
  for (const a of allocs) {
    const [charge] = await tx.select().from(rentChargesTable).where(eq(rentChargesTable.id, a.rentChargeId));
    if (charge) {
      const newAllocated = Number(charge.allocatedILS) - Number(a.amountILS);
      const clamped = newAllocated < 0 ? 0 : newAllocated;
      await tx.update(rentChargesTable).set({
        allocatedILS: clamped.toFixed(2),
        status: charge.status === "cancelled" ? "cancelled" : (clamped >= Number(charge.amountILS) - 0.005 ? "settled" : "open"),
      }).where(eq(rentChargesTable.id, charge.id));
    }
    await tx.delete(receiptAllocationsTable).where(eq(receiptAllocationsTable.id, a.id));
  }
}

// ─── Late fees (Phase 2, slice 9) ────────────────────────────────────────────

export interface LateFeePolicy {
  enabled: boolean;
  graceDays: number;
  mode: "percent" | "flat";
  rate: number; // percent of outstanding (percent) or ILS amount (flat)
}

export interface LateFeeCandidate {
  sourceChargeId: number;
  contractId: number;
  tenantId: number;
  periodStart: string;
  periodEnd: string;
  outstandingILS: number;
  feeILS: number;
}

const feeFor = (policy: LateFeePolicy, outstanding: number): number =>
  policy.mode === "flat" ? round2(policy.rate) : round2((outstanding * policy.rate) / 100);

/**
 * Overdue rent charges eligible for a late fee as of `asOf`: kind='rent', still
 * open, outstanding > 0, past their due date by more than the grace period, and
 * without an existing late-fee charge. Returns the fee each would incur. Pure
 * read — writes nothing.
 */
export async function computeLateFees(exec: Exec, policy: LateFeePolicy, asOf: string): Promise<LateFeeCandidate[]> {
  if (!policy.enabled || !(policy.rate > 0)) return [];
  const cutoff = addDays(asOf, -Math.max(0, Math.trunc(policy.graceDays))); // due on/before cutoff = past grace
  const rows = await exec
    .select()
    .from(rentChargesTable)
    .where(and(
      eq(rentChargesTable.kind, "rent"),
      eq(rentChargesTable.status, "open"),
      lte(rentChargesTable.dueDate, cutoff),
    ))
    .orderBy(asc(rentChargesTable.dueDate), asc(rentChargesTable.id));
  const out: LateFeeCandidate[] = [];
  for (const c of rows) {
    const outstanding = round2(Number(c.amountILS) - Number(c.allocatedILS));
    if (outstanding <= 0.005) continue;
    const [existing] = await exec.select({ id: rentChargesTable.id }).from(rentChargesTable).where(eq(rentChargesTable.sourceChargeId, c.id));
    if (existing) continue;
    const feeILS = feeFor(policy, outstanding);
    if (feeILS <= 0.005) continue;
    out.push({ sourceChargeId: c.id, contractId: c.contractId, tenantId: c.tenantId, periodStart: c.periodStart, periodEnd: c.periodEnd, outstandingILS: outstanding, feeILS });
  }
  return out;
}

/**
 * Apply late fees as of `asOf`: for every eligible overdue charge, insert a
 * late-fee rent charge (kind='late_fee', source_charge_id set, due `asOf`).
 * Idempotent via the unique source_charge_id. Returns the charges created; the
 * caller posts each one's ledger accrual (DR Late-fee Income / CR Receivable).
 */
export async function applyLateFees(tx: Exec, policy: LateFeePolicy, asOf: string, createdBy?: number | null) {
  const candidates = await computeLateFees(tx, policy, asOf);
  const created: Array<typeof rentChargesTable.$inferSelect> = [];
  for (const cand of candidates) {
    const [row] = await tx
      .insert(rentChargesTable)
      .values({
        contractId: cand.contractId, tenantId: cand.tenantId,
        periodStart: cand.periodStart, periodEnd: cand.periodEnd, dueDate: asOf,
        kind: "late_fee", sourceChargeId: cand.sourceChargeId,
        amountILS: cand.feeILS.toFixed(2), createdBy: createdBy ?? null,
        notes: `رسوم تأخير على استحقاق #${cand.sourceChargeId}`,
      })
      .onConflictDoNothing({ target: rentChargesTable.sourceChargeId })
      .returning();
    if (row) created.push(row);
  }
  return created;
}
