// ---------------------------------------------------------------------------
// reset-data — wipe all ENTERED data while preserving the accounts and the
// system configuration.
//
//   KEEPS : users (accounts + passwords), settings (company info / logo /
//           print header), exchange_rates (FX configuration)
//   WIPES : units, tenants, contracts, receipt_vouchers, payment_vouchers,
//           cheques, bank_accounts, documents, audit_log
//
// Safe by construction: the schema declares no DB-level foreign keys, so a
// TRUNCATE of the wipe list cannot cascade into the kept tables. Sequences are
// reset (RESTART IDENTITY) so new records start numbering from 1 again.
//
// DESTRUCTIVE and IRREVERSIBLE. Dry-run by default — it only prints the row
// counts it *would* delete. You must pass BOTH --apply and --confirm to write.
// Take a database backup/snapshot first.
//
// Usage (needs DATABASE_URL pointing at the target database):
//   pnpm --filter @workspace/scripts run reset:data              # dry run (report only)
//   pnpm --filter @workspace/scripts run reset:data --apply --confirm   # actually wipe
// ---------------------------------------------------------------------------
import { pool } from "@workspace/db";

// Order does not matter (no DB-level FKs); listed logically for the report.
const WIPE = [
  "units",
  "tenants",
  "contracts",
  "receipt_vouchers",
  "payment_vouchers",
  "cheques",
  "bank_accounts",
  "documents",
  "audit_log",
] as const;

const KEEP = ["users", "settings", "exchange_rates"] as const;

const APPLY = process.argv.includes("--apply");
const CONFIRM = process.argv.includes("--confirm");

async function count(table: string): Promise<number> {
  const { rows } = await pool.query<{ n: string }>(`select count(*)::int as n from ${table}`);
  return Number(rows[0]?.n ?? 0);
}

async function main() {
  console.log(`reset-data — wipe entered data, keep accounts + configuration${APPLY && CONFIRM ? " [--apply --confirm]" : " (dry run)"}\n`);

  console.log("Will DELETE (all rows):");
  let totalToDelete = 0;
  for (const t of WIPE) {
    const n = await count(t);
    totalToDelete += n;
    console.log(`  · ${t.padEnd(18)} ${n} row(s)`);
  }
  console.log(`\nWill KEEP (untouched):`);
  for (const t of KEEP) {
    const n = await count(t);
    console.log(`  · ${t.padEnd(18)} ${n} row(s)`);
  }

  if (!APPLY || !CONFIRM) {
    console.log(`\nDry run — nothing was changed. ${totalToDelete} row(s) across ${WIPE.length} table(s) would be deleted.`);
    console.log("To actually wipe (IRREVERSIBLE — back up first):");
    console.log("  pnpm --filter @workspace/scripts run reset:data --apply --confirm");
    return 0;
  }

  console.log(`\nApplying — truncating ${WIPE.length} table(s) and resetting their id sequences...`);
  await pool.query(`TRUNCATE TABLE ${WIPE.join(", ")} RESTART IDENTITY;`);

  // Verify
  let remaining = 0;
  for (const t of WIPE) remaining += await count(t);
  const keptUsers = await count("users");
  console.log(`Done. Wiped tables now hold ${remaining} row(s) total. Users preserved: ${keptUsers}.`);
  if (remaining !== 0) throw new Error(`expected 0 rows after truncate, found ${remaining}`);
  return 0;
}

main()
  .then(async () => { await pool.end().catch(() => {}); process.exit(0); })
  .catch(async (err) => { console.error("reset-data failed:", err); await pool.end().catch(() => {}); process.exit(1); });
