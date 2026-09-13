// ---------------------------------------------------------------------------
// Receivables service (Phase 1, slice 10). Rent charges are ACCRUALS — what a
// tenant owes per rent period — tracked in rent_charges (not the cash/bank
// ledger, which stays money-only). A tenant receipt is applied to open charges
// FIFO (oldest first, freeze D2); the remainder is an unallocated credit.
//
//   tenant amount due = Σ (amount − allocated) over their non-cancelled charges
// ---------------------------------------------------------------------------
import { db, rentChargesTable, receiptAllocationsTable } from "@workspace/db";
import { and, eq, ne, sql, asc } from "drizzle-orm";

type Exec = typeof db | Parameters<Parameters<typeof db.transaction>[0]>[0];

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
      .onConflictDoNothing({ target: [rentChargesTable.contractId, rentChargesTable.periodStart] })
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
