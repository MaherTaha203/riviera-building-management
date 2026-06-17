---
name: Voucher advisory locks
description: How sequential voucher/contract numbers are generated without race conditions, and how PATCH keeps tenant balance consistent
---

## Voucher number race prevention
All three number generators use `pg_advisory_xact_lock` inside `db.transaction()`.
POST handlers call `generateXxx(tx)` within their own `db.transaction()` so the lock and the insert are in the same transaction.

**Why:** MAX()-without-lock allows two concurrent requests to read the same MAX and insert duplicate numbers.
**How to apply:** always pass `tx` when calling the generator; never call it outside a transaction.

Lock IDs (in `src/lib/vouchers.ts`): RV=1_101_001, PV=1_101_002, CTR=1_101_003.

## PATCH receipt-voucher tenant-balance consistency
`PATCH /receipt-vouchers/:id` must fetch the existing voucher, compute the delta between old and new `amountILS`, reverse the old tenant's balance, then credit the new tenant — all inside one `db.transaction()`. Also handles `tenantId` reassignment.

**Why:** Changing amountILS without adjusting tenant balance causes balance ≠ sum(linked RVs).
**How to apply:** always wrap PATCH balance adjustments in a transaction; re-fetch the tenant *after* reversing the old balance when old and new tenant are the same.
