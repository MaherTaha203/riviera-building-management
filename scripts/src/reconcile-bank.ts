// ---------------------------------------------------------------------------
// Reconcile bank-account balances against their vouchers — the executable
// proof for invariant I2 (Phase B of the financial-linkage remediation).
//
//   I2:  bank_accounts.balance_ils ==
//          Σ receipts(bank_transfer, bank_account_id = acc).amount_ils
//        − Σ payments(bank_transfer, bank_account_id = acc).amount_ils
//
// (The cheque terms of I2 arrive with Phase C.) An INDEPENDENT raw-SQL re-check
// that reports drift (exit 1), repairs with --fix, and re-verifies. Run it
// against production before/after Phase B ships, and periodically.
//
// Usage (needs DATABASE_URL in the environment):
//   pnpm --filter @workspace/scripts run reconcile:bank        # report, exit 1 on drift
//   pnpm --filter @workspace/scripts run reconcile:bank --fix  # repair + re-verify
// ---------------------------------------------------------------------------
import { pool } from "@workspace/db";

const FIX = process.argv.includes("--fix");
const EPS = 0.005; // ILS rounding tolerance

interface Row { id: number; label: string; stored: number; computed: number }

async function scan() {
  const { rows } = await pool.query<Row>(`
    select ba.id,
           ba.bank_name || ' — ' || ba.account_name as label,
           ba.balance_ils::float8 as stored,
           ( coalesce((select sum(r.amount_ils) from receipt_vouchers r
                        where r.bank_account_id = ba.id and r.payment_method = 'bank_transfer'), 0)
           - coalesce((select sum(p.amount_ils) from payment_vouchers p
                        where p.bank_account_id = ba.id and p.payment_method = 'bank_transfer'), 0)
           )::float8 as computed
    from bank_accounts ba
    order by ba.id
  `);
  const violations = rows.filter((r) => Math.abs(r.stored - r.computed) > EPS);
  return { total: rows.length, violations };
}

async function main() {
  console.log(`reconcile-bank — invariant I2 (balance == Σ linked receipts − Σ linked payments)${FIX ? " [--fix]" : ""}\n`);
  const { total, violations } = await scan();
  console.log(`  accounts scanned: ${total}`);
  console.log(`  drift found:      ${violations.length}\n`);
  for (const v of violations) {
    console.log(`  ${v.label} (#${v.id}):  stored ${v.stored.toFixed(2)}  →  computed ${v.computed.toFixed(2)}`);
  }

  if (violations.length === 0) {
    console.log("\n✓ I2 holds — every bank balance equals the sum of its linked vouchers.");
    return 0;
  }
  if (!FIX) {
    console.log(`\n✗ I2 violated by ${violations.length} account(s). Re-run with --fix to repair.`);
    return 1;
  }
  for (const v of violations) {
    await pool.query("update bank_accounts set balance_ils = $1 where id = $2", [v.computed.toFixed(2), v.id]);
  }
  console.log(`\n  repaired ${violations.length} account(s); re-verifying…`);
  const after = await scan();
  if (after.violations.length === 0) {
    console.log("✓ I2 now holds after repair.");
    return 0;
  }
  console.log(`✗ still ${after.violations.length} violation(s) after repair — investigate.`);
  return 1;
}

main()
  .then(async (code) => { await pool.end().catch(() => {}); process.exit(code); })
  .catch(async (err) => { console.error("reconcile-bank failed:", err); await pool.end().catch(() => {}); process.exit(1); });
