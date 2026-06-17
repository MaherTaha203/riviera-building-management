---
name: Voucher advisory locks
description: How sequential voucher/contract numbers are generated without race conditions
---

## Rule
All three number generators (receipt vouchers, payment vouchers, contracts) use
`pg_advisory_xact_lock` inside a `db.transaction()` call. The POST handlers wrap
the generate + insert (and any balance update) atomically in that same transaction.

## Lock IDs
- LOCK_RV  = 1_101_001  (receipt vouchers)
- LOCK_PV  = 1_101_002  (payment vouchers)
- LOCK_CTR = 1_101_003  (contracts)

## Implementation
- `generateReceiptVoucherNumber(tx?)`, `generatePaymentVoucherNumber(tx?)`, `generateContractNumber(tx?)` in `artifacts/api-server/src/lib/vouchers.ts`
- Accept optional `TxClient` param; when called inside a transaction, pass `tx`
- Lock acquired via `tx.execute(sql\`SELECT pg_advisory_xact_lock(${lockId})\`)`
- POST handlers: `await db.transaction(async (tx) => { const num = await generateXxx(tx); ... await tx.insert(...) })`

**Why:** MAX()-based generation without a lock allows two concurrent requests to read the same MAX and insert duplicate numbers.
