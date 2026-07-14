// ---------------------------------------------------------------------------
// Reconcile unit occupancy against contracts — the executable proof for
// invariant I1 (Phase A of the financial-linkage remediation).
//
//     I1:  units.status == "occupied"  ⟺  ∃ active contract for the unit
//          (units with no active contract are "vacant", or a manual "maintenance")
//
// This is an INDEPENDENT re-implementation of the rule (raw SQL, deliberately
// not sharing code with lib/occupancy.ts) so it is a genuine cross-check, not a
// tautology. Run it three ways:
//   • before deploying Phase A  → measures existing drift
//   • with --fix                → repairs drift, then re-verifies
//   • in CI / periodically      → fails (exit 1) if anything drifted again
//
// Usage (needs DATABASE_URL in the environment):
//   pnpm --filter @workspace/scripts run reconcile:units        # report, exit 1 on drift
//   pnpm --filter @workspace/scripts run reconcile:units --fix  # repair + re-verify
// ---------------------------------------------------------------------------
import { pool } from "@workspace/db";

const FIX = process.argv.includes("--fix");

interface Row { id: number; unitNumber: string; status: string; hasActive: boolean }

/** The invariant's rule, expressed independently of lib/occupancy.ts. */
function expectedStatus(hasActive: boolean, current: string): string {
  if (hasActive) return "occupied";
  return current === "maintenance" ? "maintenance" : "vacant";
}

async function scan() {
  // hasActive is computed in SQL — an independent second opinion on occupancy.
  const { rows } = await pool.query<Row>(`
    select u.id,
           u.unit_number as "unitNumber",
           u.status,
           exists (select 1 from contracts c where c.unit_id = u.id and c.status = 'active') as "hasActive"
    from units u
    order by u.id
  `);
  const violations = rows
    .map((u) => ({ ...u, expected: expectedStatus(u.hasActive, u.status) }))
    .filter((u) => u.expected !== u.status);
  return { total: rows.length, violations };
}

async function main() {
  console.log(`reconcile-units — invariant I1 (occupied ⇔ active contract)${FIX ? " [--fix]" : ""}\n`);

  const { total, violations } = await scan();
  console.log(`  units scanned: ${total}`);
  console.log(`  drift found:   ${violations.length}\n`);
  for (const v of violations) {
    console.log(`  unit ${v.unitNumber} (#${v.id}):  ${v.status}  →  ${v.expected}`);
  }

  if (violations.length === 0) {
    console.log("\n✓ I1 holds — every unit's occupancy matches its contracts.");
    return 0;
  }
  if (!FIX) {
    console.log(`\n✗ I1 violated by ${violations.length} unit(s). Re-run with --fix to repair.`);
    return 1;
  }

  // Repair, then re-verify — a fix that doesn't re-prove clean is not a fix.
  for (const v of violations) {
    await pool.query("update units set status = $1 where id = $2", [v.expected, v.id]);
  }
  console.log(`\n  repaired ${violations.length} unit(s); re-verifying…`);
  const after = await scan();
  if (after.violations.length === 0) {
    console.log("✓ I1 now holds after repair.");
    return 0;
  }
  console.log(`✗ still ${after.violations.length} violation(s) after repair — investigate.`);
  return 1;
}

main()
  .then(async (code) => { await pool.end().catch(() => {}); process.exit(code); })
  .catch(async (err) => { console.error("reconcile-units failed:", err); await pool.end().catch(() => {}); process.exit(1); });
