// ---------------------------------------------------------------------------
// provision-accounts — bridge the legacy bank_accounts (and the implicit cash
// fund) into the unified `accounts` table (Architecture Freeze v1.0, D3/§22).
//
// For each bank_accounts row with no mirror yet, creates an accounts row
// (kind='bank', opening_balance_ils = the current stored balance, captured as a
// documented opening — §12/§22, legacy_bank_account_id = the bank row). Ensures
// at least one cash account exists. Idempotent and additive: it never edits or
// deletes anything, and re-running is a no-op for already-mirrored rows.
//
// Dry-run by default; pass --apply to write.
//   pnpm --filter @workspace/scripts run provision:accounts
//   pnpm --filter @workspace/scripts run provision:accounts --apply
// ---------------------------------------------------------------------------
import { pool } from "@workspace/db";

const APPLY = process.argv.includes("--apply");
const CASH_NAME = "الصندوق الرئيسي";

async function main() {
  console.log(`provision-accounts — mirror bank_accounts + cash into accounts${APPLY ? " [--apply]" : " (dry run)"}\n`);

  const { rows: banks } = await pool.query<{ id: number; bank_name: string; account_name: string; currency: string; balance_ils: string }>(
    `select b.id, b.bank_name, b.account_name, b.currency, b.balance_ils
       from bank_accounts b
      where not exists (select 1 from accounts a where a.legacy_bank_account_id = b.id)
      order by b.id`,
  );
  console.log(`Bank accounts to mirror: ${banks.length}`);
  for (const b of banks) {
    const name = `${b.bank_name} — ${b.account_name}`;
    console.log(`  · bank #${b.id} → account "${name}" (${b.currency}) opening ${Number(b.balance_ils).toFixed(2)}`);
    if (APPLY) {
      await pool.query(
        `insert into accounts (kind, name, currency, opening_balance_ils, opening_date, opening_source, legacy_bank_account_id)
         values ('bank', $1, $2, $3, current_date, 'migrated from bank_accounts', $4)`,
        [name, b.currency, b.balance_ils, b.id],
      );
    }
  }

  const { rows: cashRows } = await pool.query<{ n: number }>(`select count(*)::int as n from accounts where kind = 'cash'`);
  const hasCash = Number(cashRows[0]?.n ?? 0) > 0;
  if (hasCash) {
    console.log(`\nCash account: already exists (${cashRows[0].n}) — no change.`);
  } else {
    console.log(`\nCash account: none → create "${CASH_NAME}" (ILS) opening 0.00`);
    if (APPLY) {
      await pool.query(
        `insert into accounts (kind, name, currency, opening_balance_ils, opening_date, opening_source)
         values ('cash', $1, 'ILS', '0', current_date, 'initial cash fund')`,
        [CASH_NAME],
      );
    }
  }

  if (!APPLY) {
    console.log(`\nDry run — nothing written. Re-run with --apply to create the account rows.`);
    return 0;
  }
  const { rows: totals } = await pool.query<{ kind: string; n: number }>(`select kind, count(*)::int as n from accounts group by kind order by kind`);
  console.log(`\nApplied. accounts now: ${totals.map((t) => `${t.kind}=${t.n}`).join(", ") || "(none)"}`);
  return 0;
}

main()
  .then(async () => { await pool.end().catch(() => {}); process.exit(0); })
  .catch(async (err) => { console.error("provision-accounts failed:", err); await pool.end().catch(() => {}); process.exit(1); });
