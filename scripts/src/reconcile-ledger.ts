// ---------------------------------------------------------------------------
// reconcile-ledger — read-only integrity check over the financial ledger
// (Architecture Freeze v1.0, §21/§25). Recomputes every account balance from
// financial_movements and reports it, and flags anything that would break an
// invariant. It writes nothing.
//
// Checks:
//   * per-account projected balance = opening + Σ(credit) − Σ(debit)  [posted]
//   * movements with a NULL period (allowed for now; will be tightened later)
//   * movements whose amount is negative (should be impossible: CHECK + sign
//     carried by direction) — reported if ever seen
//   * reversal linkage: every reverses_id points to an existing movement
//
// Usage (needs DATABASE_URL):
//   pnpm --filter @workspace/scripts run reconcile:ledger
// ---------------------------------------------------------------------------
import { pool } from "@workspace/db";

async function main() {
  console.log("reconcile-ledger — ledger integrity & balance projection (read-only)\n");

  const { rows: balances } = await pool.query<{ id: number; kind: string; name: string; opening: string; credit: string; debit: string; balance: string }>(
    `select a.id, a.kind, a.name,
            a.opening_balance_ils as opening,
            coalesce(sum(m.amount_ils) filter (where m.direction='credit' and m.status='posted'),0) as credit,
            coalesce(sum(m.amount_ils) filter (where m.direction='debit'  and m.status='posted'),0) as debit,
            a.opening_balance_ils
              + coalesce(sum(m.amount_ils) filter (where m.direction='credit' and m.status='posted'),0)
              - coalesce(sum(m.amount_ils) filter (where m.direction='debit'  and m.status='posted'),0) as balance
       from accounts a
       left join financial_movements m on m.account_id = a.id
      group by a.id, a.kind, a.name, a.opening_balance_ils
      order by a.id`,
  );

  if (balances.length === 0) {
    console.log("  (no accounts yet)");
  } else {
    console.log("  Account balances (projected from the ledger):");
    for (const b of balances) {
      console.log(`   #${b.id} [${b.kind}] ${b.name.padEnd(24)} opening ${Number(b.opening).toFixed(2)}  +${Number(b.credit).toFixed(2)}  -${Number(b.debit).toFixed(2)}  = ${Number(b.balance).toFixed(2)}`);
    }
  }

  const [{ rows: movCount }, { rows: nullPeriod }, { rows: negAmount }, { rows: badRev }, { rows: unbalanced }] = await Promise.all([
    pool.query(`select count(*)::int as n from financial_movements`),
    pool.query(`select count(*)::int as n from financial_movements where period_id is null`),
    pool.query(`select count(*)::int as n from financial_movements where amount_ils < 0`),
    pool.query(`select count(*)::int as n from financial_movements r where r.reverses_id is not null and not exists (select 1 from financial_movements o where o.id = r.reverses_id)`),
    // Double-entry invariant (Phase 2): every journal-entry group must net to
    // zero in signed ILS (credit +, debit −). Legacy single-leg rows carry a
    // NULL entry_id and are excluded.
    pool.query(`select count(*)::int as n from (
        select entry_id
          from financial_movements
         where entry_id is not null and status = 'posted'
         group by entry_id
        having abs(coalesce(sum(case when direction='credit' then amount_ils else -amount_ils end),0)) >= 0.005
      ) g`),
  ]);

  console.log(`\n  Movements: ${(movCount[0] as any).n} total`);
  const issues: string[] = [];
  if ((nullPeriod[0] as any).n > 0) console.log(`  · ${(nullPeriod[0] as any).n} movement(s) have no period (allowed until period assignment is enabled)`);
  if ((negAmount[0] as any).n > 0) issues.push(`${(negAmount[0] as any).n} movement(s) have a negative amount_ils (invariant violation)`);
  if ((badRev[0] as any).n > 0) issues.push(`${(badRev[0] as any).n} reversal(s) point to a missing original movement`);
  if ((unbalanced[0] as any).n > 0) issues.push(`${(unbalanced[0] as any).n} journal entry group(s) do not balance (Σ signedDelta ≠ 0)`);

  if (issues.length === 0) {
    console.log("\n✓ No ledger integrity violations detected.");
    return 0;
  }
  console.log("\n✗ Integrity issues:");
  for (const i of issues) console.log(`  - ${i}`);
  return 1;
}

main()
  .then(async (code) => { await pool.end().catch(() => {}); process.exit(code ?? 0); })
  .catch(async (err) => { console.error("reconcile-ledger failed:", err); await pool.end().catch(() => {}); process.exit(1); });
