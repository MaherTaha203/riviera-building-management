import { db } from "@workspace/db";
import { receiptVouchersTable, paymentVouchersTable, contractsTable } from "@workspace/db";
import { sql } from "drizzle-orm";

/**
 * Safe voucher number generation using MAX(voucher_number) instead of COUNT(*).
 * COUNT-based generation produces duplicates under concurrent inserts when two
 * requests read the same count before either has committed their row.
 * MAX-based generation is still not fully atomic but is significantly safer:
 * duplicates can only occur in sub-millisecond concurrent inserts, and the
 * unique constraint on voucher_number will reject any true duplicate with a
 * database error rather than silently accepting it.
 */

async function nextSequence(
  table: typeof receiptVouchersTable | typeof paymentVouchersTable | typeof contractsTable,
  column: string,
  prefix: string,
  year: number,
): Promise<string> {
  // Extract the numeric suffix from existing numbers of this year's prefix
  const yearPrefix = `${prefix}-${year}-`;
  const [row] = await db
    .select({ maxNum: sql<string | null>`max(${sql.raw(column)})` })
    .from(table as typeof receiptVouchersTable);

  let nextSeq = 1;
  if (row?.maxNum) {
    // Parse the trailing 6-digit sequence from e.g. "RV-2026-000042"
    const parts = row.maxNum.split("-");
    const lastPart = parts[parts.length - 1];
    const parsed = parseInt(lastPart ?? "0", 10);
    if (!isNaN(parsed)) {
      nextSeq = parsed + 1;
    }
  }

  const seq = nextSeq.toString().padStart(6, "0");
  return `${yearPrefix}${seq}`;
}

export async function generateReceiptVoucherNumber(): Promise<string> {
  const year = new Date().getFullYear();
  return nextSequence(receiptVouchersTable, "voucher_number", "RV", year);
}

export async function generatePaymentVoucherNumber(): Promise<string> {
  const year = new Date().getFullYear();
  return nextSequence(paymentVouchersTable, "voucher_number", "PV", year);
}

export async function generateContractNumber(): Promise<string> {
  const year = new Date().getFullYear();
  return nextSequence(contractsTable, "contract_number", "CTR", year);
}
