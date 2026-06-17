# Riviera Building Management System

A commercial building management system for managing units, tenants, contracts, financial vouchers, cash fund, bank accounts, cheques, and documents — with full RTL Arabic UI.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server (port 8080, proxied to /api)
- `pnpm run typecheck` — full typecheck across all packages (0 errors expected)
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- Required env: `DATABASE_URL` — Postgres connection string; `SESSION_SECRET` — JWT signing secret

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- API: Express 5 + pino HTTP logging
- DB: PostgreSQL + Drizzle ORM (schema in `lib/db/src/schema/`)
- Validation: Zod (`zod/v4`), `drizzle-zod`, `validateBody()` middleware on all write routes
- API codegen: Orval (from `lib/api-spec/openapi.yaml` → `lib/api-client-react/src/generated/`)
- Build: esbuild (CJS bundle, `artifacts/api-server/dist/`)
- Frontend: React + Vite + Wouter + TanStack Query + shadcn/ui, Arabic RTL (`dir="rtl"`)

## Where things live

- DB schema: `lib/db/src/schema/` — one file per entity
- OpenAPI spec: `lib/api-spec/openapi.yaml` — source of truth for API contracts
- Generated client hooks: `lib/api-client-react/src/generated/api.ts`
- API routes: `artifacts/api-server/src/routes/` — one file per resource
- Frontend pages: `artifacts/riviera-bms/src/pages/`
- Voucher number generation: `artifacts/api-server/src/lib/vouchers.ts` (advisory lock)

## Architecture decisions

- **Voucher numbers use pg_advisory_xact_lock**: `generateReceiptVoucherNumber(tx)`, `generatePaymentVoucherNumber(tx)`, `generateContractNumber(tx)` each acquire a named advisory lock inside `db.transaction()` to prevent duplicates under concurrency. POST handlers wrap generate + insert in the same transaction.
- **Tenant balance is a denormalized aggregate**: `tenants.balance` equals `SUM(receipt_vouchers.amount_ils WHERE tenant_id = ?)`. All receipt voucher create/patch/delete handlers maintain this invariant atomically via `db.transaction()`.
- **Bank account `balanceILS` is auto-maintained**: Updated on bank_transfer receipt/payment voucher create, patch, and delete. No manual entry needed.
- **Base64 document storage**: `documents.fileUrl` stores files as base64 data URIs for small documents. No external file storage required.
- **Account statements are server-computed**: The `/account-statements` endpoint merges receipt vouchers (credit) and payment vouchers (debit) in a single chronological ledger with a running balance.

## Product

- **Units & Tenants**: Register building units (floor, type, area) and tenants (individual/company).
- **Contracts**: Link tenants to units with start/end date, rent amount, currency, exchange rate (auto-computes rentAmountILS).
- **Receipt Vouchers**: Record incoming payments from tenants (cash, cheque, bank transfer). Auto-updates tenant balance and bank account balance.
- **Payment Vouchers**: Record outgoing payments/expenses. Auto-updates bank account balance.
- **Cash Fund**: Real-time cash balance = sum of cash receipts minus cash payments.
- **Bank Accounts**: Track balances automatically synced from bank-transfer vouchers.
- **Cheques**: Track cheques with status (pending/cleared/bounced) and due dates.
- **Account Statements**: Two-sided ledger (credit receipts + debit payments) with running balance, filterable by tenant and date range.
- **Reports**: Summary KPIs (total receipts, payments, net, occupancy rate, monthly rent), filterable by date range.
- **Documents**: Attach files (PDF, images, etc.) to units, tenants, or contracts. Stored as base64 in DB.

## Gotchas

- **Never use console.log in server code** — use `req.log` in route handlers and `logger` for non-request code.
- **Run `pnpm --filter @workspace/api-spec run codegen` after any OpenAPI change** — otherwise generated hooks and Zod schemas are stale.
- **`DATABASE_URL` in the shell env may differ from the api-server's runtime env** — use `psql` with the URL extracted from the running process, not the shell env.
- **Zod is not a direct dep of `@workspace/api-server`** — use the `SafeParseSchema` interface and `@workspace/api-zod` schemas. Do not import `zod` directly in the server.
- **`TxClient` type**: `Parameters<Parameters<typeof db.transaction>[0]>[0]` — used when passing `tx` to voucher generators.
- **Admin user**: manually seeded via bcryptjs + direct DB insert. Username: `admin`.
- **Bank name matching is case-sensitive** — known limitation, pending fix.

## User preferences

_Populate as you build — explicit user instructions worth remembering across sessions._

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
