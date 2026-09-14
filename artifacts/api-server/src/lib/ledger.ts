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
import { db, accountsTable, financialMovementsTable, financialPeriodsTable } from "@workspace/db";
import { and, eq, gte, isNull, lte, sql } from "drizzle-orm";
import { randomUUID } from "node:crypto";

// Accepts either the base db or a transaction client.
type Exec = typeof db | Parameters<Parameters<typeof db.transaction>[0]>[0];

/** An error whose message is safe to show the user, with an HTTP status. */
export class ClosedPeriodError extends Error {
  readonly status = 409;
  readonly expose = true;
  constructor(message: string) { super(message); this.name = "ClosedPeriodError"; }
}

export type MovementDirection = "credit" | "debit";
export type MovementSourceType =
  | "receipt" | "payment" | "cheque" | "transfer" | "rent_charge" | "adjustment" | "opening" | "closing";

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
  entryId?: string | null;      // double-entry group (set by postJournalEntry)
  createdBy?: number | null;
  // optional non-authoritative currency memo
  originalAmount?: number | null;
  originalCurrency?: string | null;
  fxRate?: number | null;
}

/**
 * Resolve the financial period that contains `txnDate` (start ≤ date ≤ end) and
 * enforce the closed-period rule (freeze D5): a closed period is frozen, so any
 * attempt to post OR reverse a movement dated within it is rejected — a
 * correction goes through reopening the period, or a corrective document in an
 * open period. Returns the period id to stamp on the movement (null when no
 * period covers the date — periods are opt-in, so enforcement only bites once a
 * covering period exists and is closed).
 */
export async function resolvePeriodForDate(tx: Exec, txnDate: string): Promise<number | null> {
  const [p] = await tx
    .select({ id: financialPeriodsTable.id, status: financialPeriodsTable.status, label: financialPeriodsTable.label })
    .from(financialPeriodsTable)
    .where(and(lte(financialPeriodsTable.startDate, txnDate), gte(financialPeriodsTable.endDate, txnDate)))
    .limit(1);
  if (p && p.status === "closed") {
    throw new ClosedPeriodError(`الفترة المالية «${p.label}» مقفلة — لا يمكن تسجيل أو تعديل حركة بتاريخها`);
  }
  return p?.id ?? null;
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
  // Closed-period enforcement + period assignment (D5).
  const periodId = await resolvePeriodForDate(tx, input.txnDate);
  const [row] = await tx
    .insert(financialMovementsTable)
    .values({
      sourceType: input.sourceType,
      sourceId: input.sourceId ?? null,
      accountId: input.accountId,
      periodId: periodId ?? input.periodId ?? null,
      txnDate: input.txnDate,
      amountILS: String(input.amountILS),
      direction: input.direction,
      relatedPartyType: input.relatedPartyType ?? null,
      relatedPartyId: input.relatedPartyId ?? null,
      reference: input.reference ?? null,
      status: "posted",
      entryId: input.entryId ?? null,
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

/** One leg of a balanced journal entry. */
export interface JournalLeg {
  accountId: number;
  direction: MovementDirection;
  amountILS: number;              // >= 0; sign carried by direction
  relatedPartyType?: string | null;
  relatedPartyId?: number | null;
  reference?: string | null;
  reason?: string | null;
  originalAmount?: number | null;
  originalCurrency?: string | null;
  fxRate?: number | null;
}

/** Shared attributes of every leg in one journal entry. */
export interface JournalEntryCommon {
  sourceType: MovementSourceType;
  sourceId?: number | null;
  txnDate: string;                // YYYY-MM-DD
  createdBy?: number | null;
  // Base idempotency key; each leg is posted with `${key}:${i}` so a retry of the
  // whole entry never double-posts a leg.
  idempotencyKey?: string | null;
  // Explicit group id; defaults to a fresh uuid.
  entryId?: string | null;
}

/**
 * Post a balanced double-entry journal entry (Phase 2, slice 2). Every leg is
 * appended to the ledger sharing one `entryId`, and the entry is REJECTED unless
 * its legs net to zero in signed ILS (Σ signedDelta = 0) — this is the core
 * double-entry invariant enforced at the write. Runs inside the caller's
 * transaction so an unbalanced or failed leg rolls the whole entry back.
 */
export async function postJournalEntry(tx: Exec, legs: JournalLeg[], common: JournalEntryCommon) {
  if (legs.length < 2) throw new Error("postJournalEntry: a journal entry needs at least two legs");
  const net = legs.reduce((s, l) => s + signedDeltaILS(l.direction, l.amountILS), 0);
  if (Math.abs(net) >= 0.005) {
    throw new Error(`postJournalEntry: unbalanced entry (Σ signedDelta = ${net.toFixed(2)}, must be 0)`);
  }
  const entryId = common.entryId ?? randomUUID();
  const movements = [];
  for (let i = 0; i < legs.length; i++) {
    const l = legs[i];
    movements.push(await postMovement(tx, {
      sourceType: common.sourceType,
      sourceId: common.sourceId ?? null,
      accountId: l.accountId,
      txnDate: common.txnDate,
      amountILS: l.amountILS,
      direction: l.direction,
      relatedPartyType: l.relatedPartyType ?? null,
      relatedPartyId: l.relatedPartyId ?? null,
      reference: l.reference ?? null,
      reason: l.reason ?? null,
      entryId,
      idempotencyKey: common.idempotencyKey ? `${common.idempotencyKey}:${i}` : null,
      createdBy: common.createdBy ?? null,
      originalAmount: l.originalAmount ?? null,
      originalCurrency: l.originalCurrency ?? null,
      fxRate: l.fxRate ?? null,
    }));
  }
  return { entryId, movements };
}

/**
 * Reverse an entire journal entry as a group: append an offsetting movement for
 * every still-active leg sharing `entryId`. Because each leg's reversal carries
 * the same entryId, the group's Σ signedDelta stays 0 after a full reversal.
 */
export async function reverseJournalEntry(
  tx: Exec,
  entryId: string,
  opts: { reason?: string; createdBy?: number | null } = {},
) {
  const active = await tx
    .select()
    .from(financialMovementsTable)
    .where(and(
      eq(financialMovementsTable.entryId, entryId),
      isNull(financialMovementsTable.reversesId),
      eq(financialMovementsTable.status, "posted"),
    ));
  const revs = [];
  for (const m of active) {
    const [already] = await tx
      .select({ id: financialMovementsTable.id })
      .from(financialMovementsTable)
      .where(eq(financialMovementsTable.reversesId, m.id));
    if (!already) revs.push(await reverseMovement(tx, m.id, opts));
  }
  return revs;
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
  // Closed-period enforcement (D5): a reversal is dated like its original, so a
  // document in a closed period cannot be edited/deleted until the period is
  // reopened. Also re-stamps the reversal's period.
  const periodId = await resolvePeriodForDate(tx, orig.txnDate);
  const [rev] = await tx
    .insert(financialMovementsTable)
    .values({
      sourceType: orig.sourceType,
      sourceId: orig.sourceId,
      accountId: orig.accountId,
      periodId: opts.periodId ?? periodId ?? orig.periodId,
      txnDate: orig.txnDate,
      amountILS: orig.amountILS,
      direction: orig.direction === "credit" ? "debit" : "credit",
      relatedPartyType: orig.relatedPartyType,
      relatedPartyId: orig.relatedPartyId,
      reference: orig.reference,
      status: "posted",
      entryId: orig.entryId, // stay in the original's journal-entry group
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
 * Set a source document's ledger effect to a balanced JOURNAL ENTRY (or none),
 * the double-entry analogue of setSourceLedgerEffect. Reverses every still-active
 * movement this source posted, then posts a fresh balanced entry (legs sharing
 * one entryId, Σ signedDelta = 0). create → legs set; edit → old reversed, new
 * posted; delete → legs = null (reverse only). Idempotent within a transaction.
 */
export async function setSourceJournalEffect(
  tx: Exec,
  key: { sourceType: MovementSourceType; sourceId: number },
  effect: { legs: JournalLeg[]; txnDate: string; createdBy?: number | null } | null,
) {
  await reverseActiveSourceMovements(tx, key, effect?.createdBy ?? null);
  if (!effect) return null;
  return postJournalEntry(tx, effect.legs, {
    sourceType: key.sourceType,
    sourceId: key.sourceId,
    txnDate: effect.txnDate,
    createdBy: effect.createdBy ?? null,
  });
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
  await setSourceJournalEffect(tx, key, effect && {
    txnDate: effect.txnDate,
    createdBy: effect.createdBy ?? null,
    legs: [
      { accountId: effect.fromAccountId, direction: "debit", amountILS: effect.amountILS, reference: effect.reference ?? null },
      { accountId: effect.toAccountId, direction: "credit", amountILS: effect.amountILS, reference: effect.reference ?? null },
    ],
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

export interface AccountBalanceRow {
  id: number;
  kind: string | null;
  type: string;
  code: string | null;
  isSystem: boolean;
  parentId: number | null;
  name: string;
  balanceILS: number;
}

/** Projected balance for every account (opening + Σ movements), with its chart classification. */
export async function allAccountBalancesILS(exec: Exec = db): Promise<AccountBalanceRow[]> {
  const accounts = await exec.select().from(accountsTable).orderBy(accountsTable.code, accountsTable.id);
  const out: AccountBalanceRow[] = [];
  for (const a of accounts) {
    out.push({
      id: a.id, kind: a.kind, type: a.type, code: a.code, isSystem: a.isSystem,
      parentId: a.parentId, name: a.name, balanceILS: await accountBalanceILS(exec, a.id),
    });
  }
  return out;
}
