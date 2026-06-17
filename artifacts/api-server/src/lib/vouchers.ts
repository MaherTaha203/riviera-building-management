import { db, receiptVouchersTable, paymentVouchersTable, contractsTable } from "@workspace/db";
import { sql } from "drizzle-orm";

/**
 * Concurrency-safe voucher number generation using:
 *   1. pg_advisory_xact_lock — ensures only one DB session at a time can execute
 *      the MAX() + INSERT for a given voucher type.  The lock is held for the
 *      duration of the caller's transaction and released automatically on
 *      commit or rollback.
 *   2. The caller MUST run this inside db.transaction() so that the lock scope
 *      extends to cover the INSERT, leaving no window for duplicate numbers.
 *
 * Lock IDs (bigint):  unique constants per voucher type, guaranteed not to
 * collide with each other.
 */

// Stable advisory lock IDs for each sequence
const LOCK_RV = 1_101_001;
const LOCK_PV = 1_101_002;
const LOCK_CTR = 1_101_003;

// The transaction client type — the callback arg of db.transaction()
type TxClient = Parameters<Parameters<typeof db.transaction>[0]>[0];

async function nextSequenceWithLock(
  tx: TxClient,
  table: typeof receiptVouchersTable | typeof paymentVouchersTable | typeof contractsTable,
  column: string,
  prefix: string,
  year: number,
  lockId: number,
): Promise<string> {
  // Acquire an exclusive advisory lock for this voucher type.
  // pg_advisory_xact_lock blocks until it can acquire and is released
  // automatically when the surrounding transaction ends.
  await tx.execute(sql`SELECT pg_advisory_xact_lock(${lockId})`);

  const [row] = await tx
    .select({ maxNum: sql<string | null>`max(${sql.raw(column)})` })
    .from(table as typeof receiptVouchersTable);

  let nextSeq = 1;
  if (row?.maxNum) {
    const parts = row.maxNum.split("-");
    const lastPart = parts[parts.length - 1];
    const parsed = parseInt(lastPart ?? "0", 10);
    if (!isNaN(parsed)) nextSeq = parsed + 1;
  }

  const seq = nextSeq.toString().padStart(6, "0");
  return `${prefix}-${year}-${seq}`;
}

export async function generateReceiptVoucherNumber(tx: TxClient): Promise<string> {
  return nextSequenceWithLock(tx, receiptVouchersTable, "voucher_number", "RV", new Date().getFullYear(), LOCK_RV);
}

export async function generatePaymentVoucherNumber(tx: TxClient): Promise<string> {
  return nextSequenceWithLock(tx, paymentVouchersTable, "voucher_number", "PV", new Date().getFullYear(), LOCK_PV);
}

export async function generateContractNumber(tx: TxClient): Promise<string> {
  return nextSequenceWithLock(tx, contractsTable, "contract_number", "CTR", new Date().getFullYear(), LOCK_CTR);
}
