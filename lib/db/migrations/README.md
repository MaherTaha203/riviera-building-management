# Database migrations

Phase 1 introduces a **versioned migration chain** as the single source of schema
truth, replacing production reliance on `drizzle-kit push` and the boot-time
schema guard (Architecture Freeze v1.0, §19).

## Files
- `0000_baseline_current_schema.sql` — a **baseline** of the schema that already
  existed in production (the 12 original tables). It creates them from scratch,
  so it is meant to run only against a **fresh** database.
- `0001_financial_core.sql` — the first real change: the financial core
  (`accounts`, `financial_periods`, `financial_movements`) with real foreign
  keys (`ON DELETE RESTRICT`), check constraints, and indexes. Purely additive.

## Commands (run from `lib/db`, `DATABASE_URL` must be set)
- `pnpm --filter @workspace/db run generate` — author a new migration from schema changes.
- `pnpm --filter @workspace/db run migrate` — apply pending migrations.

## Applying to a FRESH database
```
pnpm --filter @workspace/db run migrate   # applies 0000 then 0001
```
Verified end-to-end on a clean Postgres: all 15 tables, 4 RESTRICT FKs and 3
check constraints on `financial_movements`, 2 rows in the migration journal.

## Applying to the EXISTING production database (do later, with care)
Production already has the 12 original tables, so `0000` must **not** be
re-executed there — it must be **stamped as already applied**, then only `0001`
runs to add the financial-core tables. Recommended one-time baseline:

1. Ensure the migration journal table exists (drizzle creates
   `drizzle.__drizzle_migrations` on first `migrate`).
2. Insert a row marking `0000_baseline_current_schema` as applied (its hash is in
   `migrations/meta/_journal.json`), **without** running its SQL.
3. Run `pnpm --filter @workspace/db run migrate` — only `0001` executes, adding
   the three new tables.

This is a deployment step to perform deliberately against production; it is **not**
run automatically and was **not** run as part of authoring this migration.
