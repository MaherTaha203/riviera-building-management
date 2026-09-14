// ---------------------------------------------------------------------------
// Ledger service (Phase 1, slice 2) — the read/write primitives over the
// financial_movements ledger. This is the single place money is written and the
// single place balances are derived, per Architecture Freeze v1.0 (§5, §11,
// §14, §15).
//
// Conventions
//   direction 'credit' = money INTO the account (+)   e.g. a receipt/deposit
//   direction 'debit'  = money OUT of the account (−)  e.g. a payment/withdrawal
//   All amounts are ILS (D4). The original-currency columns are a memo only.
//
// Balance = accounts.opening_balance_ils + Σ signedDelta(posted movements).
// A correction is a REVERSAL: a new offsetting movement (opposite direction,
// same amount, reverses_id = original) — never an edit or delete of a posted
// row (§15). Reversals are ordinary posted rows, so the projection needs no
// special-casing: original + reversal = 0.
// ---------------------------------------------------------------------------
import { db, accountsTable, financialMovementsTable } from "@workspace/db";
import { and, eq, isNull, lte, sql } from "drizzle-orm";

// Accepts either the base db or a transaction client.
type Exec = typeof db | Parameters<Parameters<typeof db.transaction>[0]>[0];

export type MovementDirection = "credit" | "debit";
export type MovementSourceType =
  | "receipt" | "payment" | "cheque" | "transfer" | "rent_charge" | "adjustment" | "opening";

export interface PostMovementInput {
  sourceType: MovementSourceType;
  sourceId?: number | null;
  accountId: number;
  periodId?: number | null;
  txnDate: string;              // YYYY-MM-DD
  amountILS: number;            // must be >= 0; direction carries the sign
  direction: MovementDirection;
  relatedPartyType?: string | null;
  relatedPartyId?: number | null;
  reference?: string | null;
  reason?: string | null;
  idempotencyKey?: string | null;
  createdBy?: number | null;
  // optional non-authoritative currency memo
  originalAmount?: number | null;
  originalCurrency?: string | null;
  fxRate?: number | null;
}

/** Signed ILS effect of a movement on its account (credit +, debit −). */
export function signedDeltaILS(direction: string, amountILS: number | string): number {
  const n = Number(amountILS);
  return direction === "credit" ? n : -n;
}

/**
 * Append one movement to the ledger. Idempotent: if `idempotencyKey` is given
 * and a movement with that key already exists, the existing row is returned and
 * nothing new is written (§18 — a retry/double-submit never double-posts).
 * Must run inside the caller's transaction when it accompanies a document.
 */
export async function postMovement(tx: Exec, input: PostMovementInput) {
  if (!(Number(input.amountILS) >= 0)) {
    throw new Error("postMovement: amountILS must be >= 0 (sign is carried by direction)");
  }
  if (input.idempotencyKey) {
    const [existing] = await tx
      .select()
      .from(financialMovementsTable)
      .where(eq(financialMovementsTable.idempotencyKey, input.idempotencyKey));
    if (existing) return existing;
  }
  const [row] = await tx
    .insert(financialMovementsTable)
    .values({
      sourceType: input.sourceType,
      sourceId: input.sourceId ?? null,
      accountId: input.accountId,
      periodId: input.periodId ?? null,
      txnDate: input.txnDate,
      amountILS: String(input.amountILS),
      direction: input.direction,
      relatedPartyType: input.relatedPartyType ?? null,
      relatedPartyId: input.relatedPartyId ?? null,
      reference: input.reference ?? null,
      status: "posted",
      idempotencyKey: input.idempotencyKey ?? null,
      createdBy: input.createdBy ?? null,
      reason: input.reason ?? null,
      originalAmount: input.originalAmount != null ? String(input.originalAmount) : null,
      originalCurrency: input.originalCurrency ?? null,
      fxRate: input.fxRate != null ? String(input.fxRate) : null,
    })
    .returning();
  return row;
}

/**
 * Reverse a posted movement by appending an offsetting movement (opposite
 * direction, same amount, reverses_id = original). The original row is left
 * untouched (never mutated/deleted, §15); original + reversal = 0.
 */
export async function reverseMovement(
  tx: Exec,
  originalId: number,
  opts: { reason?: string; createdBy?: number | null; periodId?: number | null } = {},
) {
  const [orig] = await tx.select().from(financialMovementsTable).where(eq(financialMovementsTable.id, originalId));
  if (!orig) throw new Error(`reverseMovement: movement ${originalId} not found`);
  const [rev] = await tx
    .insert(financialMovementsTable)
    .values({
      sourceType: orig.sourceType,
      sourceId: orig.sourceId,
      accountId: orig.accountId,
      periodId: opts.periodId ?? orig.periodId,
      txnDate: orig.txnDate,
      amountILS: orig.amountILS,
      direction: orig.direction === "credit" ? "debit" : "credit",
      relatedPartyType: orig.relatedPartyType,
      relatedPartyId: orig.relatedPartyId,
      reference: orig.reference,
      status: "posted",
      reversesId: orig.id,
      createdBy: opts.createdBy ?? null,
      reason: opts.reason ?? `reversal of movement #${orig.id}`,
    })
    .returning();
  return rev;
}

/**
 * Projected balance of one account in ILS: opening + Σ signedDelta over posted
 * movements (optionally as of a date). This is the authoritative balance.
 */
export async function accountBalanceILS(exec: Exec, accountId: number, opts: { asOf?: string } = {}): Promise<number> {
  const [acc] = await exec.select().from(accountsTable).where(eq(accountsTable.id, accountId));
  if (!acc) throw new Error(`accountBalanceILS: account ${accountId} not found`);
  const conds = [eq(financialMovementsTable.accountId, accountId), eq(financialMovementsTable.status, "posted")];
  if (opts.asOf) conds.push(lte(financialMovementsTable.txnDate, opts.asOf));
  const [agg] = await exec
    .select({
      credit: sql<string>`coalesce(sum(${financialMovementsTable.amountILS}) filter (where ${financialMovementsTable.direction} = 'credit'), 0)`,
      debit: sql<string>`coalesce(sum(${financialMovementsTable.amountILS}) filter (where ${financialMovementsTable.direction} = 'debit'), 0)`,
    })
    .from(financialMovementsTable)
    .where(and(...conds));
  return Number(acc.openingBalanceILS) + Number(agg?.credit ?? 0) - Number(agg?.debit ?? 0);
}

/**
 * Set a source document's ledger effect to exactly `effect` (or none), keeping
 * the ledger consistent across create / edit / delete without ever mutating a
 * posted row. It reverses every still-active movement this source posted (via
 * an offsetting row), then posts the new movement if an effect is given.
 *
 *   create → effect set        (posts one movement)
 *   edit   → effect changed     (reverses the old, posts the new)
 *   delete → effect = null      (reverses the old only)
 *
 * "Active" = a posted original (reverses_id IS NULL) that has not yet been
 * reversed. Idempotent-safe within a transaction. Returns the new movement (or
 * null when only reversing).
 */
export async function setSourceLedgerEffect(
  tx: Exec,
  key: { sourceType: MovementSourceType; sourceId: number },
  effect: Omit<PostMovementInput, "sourceType" | "sourceId" | "idempotencyKey"> | null,
) {
  await reverseActiveSourceMovements(tx, key, effect?.createdBy ?? null);
  if (!effect) return null;
  return postMovement(tx, { ...effect, sourceType: key.sourceType, sourceId: key.sourceId });
}

/**
 * Reverse every still-active movement a source posted (a posted original with
 * reverses_id IS NULL that has not yet been reversed). Shared by the single-
 * effect and multi-leg (transfer) sync helpers so corrections never mutate a
 * posted row.
 */
async function reverseActiveSourceMovements(
  tx: Exec,
  key: { sourceType: MovementSourceType; sourceId: number },
  createdBy: number | null,
) {
  const active = await tx
    .select()
    .from(financialMovementsTable)
    .where(and(
      eq(financialMovementsTable.sourceType, key.sourceType),
      eq(financialMovementsTable.sourceId, key.sourceId),
      isNull(financialMovementsTable.reversesId),
      eq(financialMovementsTable.status, "posted"),
    ));
  for (const m of active) {
    const [alreadyReversed] = await tx
      .select({ id: financialMovementsTable.id })
      .from(financialMovementsTable)
      .where(eq(financialMovementsTable.reversesId, m.id));
    if (!alreadyReversed) {
      await reverseMovement(tx, m.id, { createdBy, reason: "superseded by edit/cancel" });
    }
  }
}

/**
 * Set a transfer's ledger effect: a balanced pair of movements sharing
 * (sourceType 'transfer', sourceId) — a debit on the source account and a
 * credit on the destination, same amount and date. create posts the pair, edit
 * reverses the old pair and posts the new, delete reverses only. The two legs
 * net to zero across the ledger, so total balances are unchanged; only the two
 * accounts move.
 */
export async function setTransferLedgerEffect(
  tx: Exec,
  transferId: number,
  effect: { fromAccountId: number; toAccountId: number; amountILS: number; txnDate: string; reference?: string | null; createdBy?: number | null } | null,
) {
  const key = { sourceType: "transfer" as const, sourceId: transferId };
  await reverseActiveSourceMovements(tx, key, effect?.createdBy ?? null);
  if (!effect) return;
  await postMovement(tx, {
    ...key, accountId: effect.fromAccountId, direction: "debit",
    amountILS: effect.amountILS, txnDate: effect.txnDate, reference: effect.reference ?? null, createdBy: effect.createdBy ?? null,
  });
  await postMovement(tx, {
    ...key, accountId: effect.toAccountId, direction: "credit",
    amountILS: effect.amountILS, txnDate: effect.txnDate, reference: effect.reference ?? null, createdBy: effect.createdBy ?? null,
  });
}

/**
 * How many posted movements an account has. Used by the read-cutover to decide
 * whether the ledger is authoritative for this account yet: once it carries any
 * posted movement, its balance is read from the ledger; before that (a brand-new
 * or not-yet-populated account) callers fall back to the legacy figure, so a
 * balance is never wrongly shown as zero.
 */
export async function accountPostedMovementCount(exec: Exec, accountId: number): Promise<number> {
  const [row] = await exec
    .select({ n: sql<number>`count(*)::int` })
    .from(financialMovementsTable)
    .where(and(eq(financialMovementsTable.accountId, accountId), eq(financialMovementsTable.status, "posted")));
  return Number(row?.n ?? 0);
}

/**
 * Net ledger effect of TRANSFER movements on an account (credit − debit over
 * posted transfer legs). The legacy balances can't represent account-to-account
 * transfers, so the legacy-vs-ledger reconciliation nets these out to stay a
 * true "vouchers/cheques dual-write is consistent" check.
 */
export async function accountTransferDeltaILS(exec: Exec, accountId: number): Promise<number> {
  const [agg] = await exec
    .select({
      credit: sql<string>`coalesce(sum(${financialMovementsTable.amountILS}) filter (where ${financialMovementsTable.direction} = 'credit'), 0)`,
      debit: sql<string>`coalesce(sum(${financialMovementsTable.amountILS}) filter (where ${financialMovementsTable.direction} = 'debit'), 0)`,
    })
    .from(financialMovementsTable)
    .where(and(
      eq(financialMovementsTable.accountId, accountId),
      eq(financialMovementsTable.status, "posted"),
      eq(financialMovementsTable.sourceType, "transfer"),
    ));
  return Number(agg?.credit ?? 0) - Number(agg?.debit ?? 0);
}

/** Projected balance for every account (opening + Σ movements). */
export async function allAccountBalancesILS(exec: Exec = db): Promise<Array<{ id: number; kind: string; name: string; balanceILS: number }>> {
  const accounts = await exec.select().from(accountsTable).orderBy(accountsTable.id);
  const out: Array<{ id: number; kind: string; name: string; balanceILS: number }> = [];
  for (const a of accounts) {
    out.push({ id: a.id, kind: a.kind, name: a.name, balanceILS: await accountBalanceILS(exec, a.id) });
  }
  return out;
}
