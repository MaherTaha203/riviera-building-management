// ---------------------------------------------------------------------------
// Backfill bank_account_id on legacy bank_transfer vouchers (Phase B).
//
// Before Phase B, bank_transfer vouchers referenced their account only by a
// free-text bank_name (and the UI often left even that empty). This resolves
// bank_account_id for existing rows by matching bank_name to a bank account —
// but ONLY when the name maps to exactly one account, so we never guess. Rows
// with no name, or an ambiguous/unknown name, are reported for manual fixing.
//
// Idempotent: only touches rows where bank_account_id IS NULL. Run once against
// production before `reconcile:bank --fix`.
//
// Usage (needs DATABASE_URL in the environment):
//   pnpm --filter @workspace/scripts run backfill:bank         # report only
//   pnpm --filter @workspace/scripts run backfill:bank --apply # write bank_account_id
// ---------------------------------------------------------------------------
import { pool } from "@workspace/db";

const APPLY = process.argv.includes("--apply");

// Bank names that map to exactly one account can be resolved unambiguously.
async function uniqueNameToId(): Promise<Map<string, number>> {
  const { rows } = await pool.query<{ bank_name: string; id: number; n: number }>(
    `select bank_name, min(id) as id, count(*)::int as n from bank_accounts group by bank_name`,
  );
  const m = new Map<string, number>();
  for (const r of rows) if (r.n === 1) m.set(r.bank_name, r.id);
  return m;
}

async function backfillTable(table: "receipt_vouchers" | "payment_vouchers", nameToId: Map<string, number>) {
  const { rows } = await pool.query<{ id: number; bank_name: string | null }>(
    `select id, bank_name from ${table}
      where payment_method = 'bank_transfer' and bank_account_id is null`,
  );
  let resolved = 0;
  const unresolved: { id: number; bank_name: string | null }[] = [];
  for (const r of rows) {
    const id = r.bank_name ? nameToId.get(r.bank_name) : undefined;
    if (id == null) { unresolved.push(r); continue; }
    if (APPLY) await pool.query(`update ${table} set bank_account_id = $1 where id = $2`, [id, r.id]);
    resolved++;
  }
  console.log(`  ${table}: ${rows.length} unlinked · ${resolved} resolvable${APPLY ? " (written)" : ""} · ${unresolved.length} need manual review`);
  for (const u of unresolved) console.log(`      · #${u.id} bank_name=${u.bank_name === null ? "(none)" : JSON.stringify(u.bank_name)}`);
  return { resolved, unresolved: unresolved.length };
}

async function main() {
  console.log(`backfill-bank — link legacy bank_transfer vouchers to accounts${APPLY ? " [--apply]" : " (dry run)"}\n`);
  const nameToId = await uniqueNameToId();
  const r = await backfillTable("receipt_vouchers", nameToId);
  const p = await backfillTable("payment_vouchers", nameToId);
  const totalUnresolved = r.unresolved + p.unresolved;
  console.log("");
  if (!APPLY) {
    console.log("Dry run — re-run with --apply to write bank_account_id, then run `reconcile:bank --fix`.");
  } else if (totalUnresolved > 0) {
    console.log(`Applied. ${totalUnresolved} row(s) still need a bank account chosen manually (edit the voucher).`);
  } else {
    console.log("Applied. All bank_transfer vouchers are now linked. Next: `reconcile:bank --fix`.");
  }
  return 0;
}

main()
  .then(async () => { await pool.end().catch(() => {}); process.exit(0); })
  .catch(async (err) => { console.error("backfill-bank failed:", err); await pool.end().catch(() => {}); process.exit(1); });
