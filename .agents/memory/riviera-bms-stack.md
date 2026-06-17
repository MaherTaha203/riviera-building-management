---
name: Riviera BMS stack
description: Key stack and conventions for the Riviera Building Management System
---

## Stack
- pnpm monorepo: `artifacts/api-server` (Express 5 + Drizzle + PostgreSQL), `artifacts/riviera-bms` (React + Vite + Wouter + TanStack Query)
- TypeScript 5.9, Zod v4 (`zod/v4` import path from `@workspace/api-zod`), Orval codegen from OpenAPI spec
- `SESSION_SECRET` env var set; admin user seeded manually via pg + bcryptjs

## Conventions
- Never `console.log` in server code — use `req.log` (route handlers) or `logger` (elsewhere)
- `validateBody(Schema)` helper at `src/lib/validate.ts`; use `SafeParseSchema` interface (Zod is NOT a direct dep of api-server)
- `TxClient` type: `Parameters<Parameters<typeof db.transaction>[0]>[0]`
- Documents: `fileUrl` column stores base64 data URI; frontend reads via FileReader
- Bank sync: on bank_transfer create/delete → update `bankAccountsTable.balanceILS` by matching `bankName` (case-sensitive)
- Front-end `riviera-bms` has no registered artifact/workflow (pre-existing state)

## Run
- API server port 8080; curl via `localhost:80/api/...` through shared proxy
- `pnpm --filter @workspace/db run push` to push schema changes (dev only)
- `pnpm --filter @workspace/api-spec run codegen` to regenerate hooks + Zod schemas
