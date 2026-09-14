// ---------------------------------------------------------------------------
// provision-accounts — bridge the legacy bank_accounts (and the implicit cash
// fund) into the unified `accounts` table, and (Phase 2, slice 1) seed the
// system Chart of Accounts used by double-entry postings and reports.
//
// For each bank_accounts row with no mirror yet, creates an accounts row
// (kind='bank', opening_balance_ils = the current stored balance, captured as a
// documented opening, legacy_bank_account_id = the bank row). Ensures at least
// one cash account exists and gives it code 1000. Seeds the system accounts
// (receivable / income / expense / equity) by their fixed codes. Idempotent and
// additive: it never edits balances or deletes anything, and re-running is a
// no-op for already-present rows (matched on the unique code / legacy id).
//
// Dry-run by default; pass --apply to write.
//   pnpm --filter @workspace/scripts run provision:accounts
//   pnpm --filter @workspace/scripts run provision:accounts --apply
// ---------------------------------------------------------------------------
import { pool } from "@workspace/db";

const APPLY = process.argv.includes("--apply");
const CASH_NAME = "الصندوق الرئيسي";
const CASH_CODE = "1000";

// The seeded chart of accounts (ledger-only system accounts). Cash/bank accounts
// are asset accounts too but are provisioned separately (above). Keep these codes
// in sync with SYSTEM_ACCOUNTS in artifacts/api-server/src/lib/accounts.ts.
const SYSTEM_ACCOUNTS: Array<{ code: string; name: string; type: string }> = [
  { code: "1100", name: "ذمم مدينة — مستأجرون", type: "asset" },
  { code: "2000", name: "ذمم دائنة", type: "liability" },
  { code: "3000", name: "حقوق الملكية", type: "equity" },
  { code: "3100", name: "الأرباح المحتجزة", type: "equity" },
  { code: "3900", name: "رصيد افتتاحي", type: "equity" },
  { code: "4000", name: "إيراد الإيجار", type: "income" },
  { code: "4100", name: "إيراد رسوم التأخير", type: "income" },
  { code: "5000", name: "المصروفات", type: "expense" },
  { code: "5900", name: "مصروفات أخرى", type: "expense" },
];

async function main() {
  console.log(`provision-accounts — mirror banks + cash, seed chart of accounts${APPLY ? " [--apply]" : " (dry run)"}\n`);

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
        `insert into accounts (kind, type, name, currency, opening_balance_ils, opening_date, opening_source, legacy_bank_account_id)
         values ('bank', 'asset', $1, $2, $3, current_date, 'migrated from bank_accounts', $4)`,
        [name, b.currency, b.balance_ils, b.id],
      );
    }
  }

  // Cash account (create if none) + ensure it carries code 1000.
  const { rows: cashRows } = await pool.query<{ id: number; code: string | null }>(`select id, code from accounts where kind = 'cash' order by id`);
  if (cashRows.length === 0) {
    console.log(`\nCash account: none → create "${CASH_NAME}" (ILS) opening 0.00, code ${CASH_CODE}`);
    if (APPLY) {
      await pool.query(
        `insert into accounts (kind, type, code, name, currency, opening_balance_ils, opening_date, opening_source)
         values ('cash', 'asset', $1, $2, 'ILS', '0', current_date, 'initial cash fund')`,
        [CASH_CODE, CASH_NAME],
      );
    }
  } else {
    const main = cashRows[0];
    console.log(`\nCash account: exists (${cashRows.length}). Main cash #${main.id} code=${main.code ?? "(none)"}`);
    if (!main.code) {
      console.log(`  · assign code ${CASH_CODE} to cash #${main.id}`);
      if (APPLY) {
        // Only if 1000 is free (never steal a code already assigned elsewhere).
        await pool.query(
          `update accounts set code = $1 where id = $2 and not exists (select 1 from accounts x where x.code = $1)`,
          [CASH_CODE, main.id],
        );
      }
    }
  }

  // Seed the ledger-only system accounts by fixed code (idempotent).
  console.log(`\nSystem chart of accounts:`);
  for (const s of SYSTEM_ACCOUNTS) {
    const { rows } = await pool.query<{ id: number }>(`select id from accounts where code = $1`, [s.code]);
    if (rows.length > 0) {
      console.log(`  · ${s.code} ${s.name} — already present (#${rows[0].id})`);
      continue;
    }
    console.log(`  · ${s.code} ${s.name} (${s.type}) — create`);
    if (APPLY) {
      await pool.query(
        `insert into accounts (type, code, name, is_system, currency, opening_balance_ils, opening_source)
         values ($1, $2, $3, true, 'ILS', '0', 'system chart of accounts')
         on conflict (code) do nothing`,
        [s.type, s.code, s.name],
      );
    }
  }

  if (!APPLY) {
    console.log(`\nDry run — nothing written. Re-run with --apply to create/seed the accounts.`);
    return 0;
  }
  const { rows: totals } = await pool.query<{ type: string; n: number }>(`select type, count(*)::int as n from accounts group by type order by type`);
  console.log(`\nApplied. accounts by type: ${totals.map((t) => `${t.type}=${t.n}`).join(", ") || "(none)"}`);
  return 0;
}

main()
  .then(async () => { await pool.end().catch(() => {}); process.exit(0); })
  .catch(async (err) => { console.error("provision-accounts failed:", err); await pool.end().catch(() => {}); process.exit(1); });
