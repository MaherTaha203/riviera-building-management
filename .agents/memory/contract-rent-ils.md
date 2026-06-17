---
name: Contract rentAmountILS PATCH
description: Contract PATCH must fetch existing row to avoid rentAmountILS staleness
---

## Rule
The PATCH `/contracts/:id` handler must:
1. Fetch the existing contract row first (SELECT before UPDATE)
2. When building the update object, if `rentAmount` OR `exchangeRate` is present in the body, recompute `rentAmountILS` using the provided value for the changed field and the existing DB value for the unchanged field

## Pattern
```typescript
const [existing] = await db.select().from(contractsTable).where(eq(contractsTable.id, id));
if (!existing) { res.status(404).json({ error: "Contract not found" }); return; }
if (rentAmount != null || exchangeRate != null) {
  const effectiveRent = rentAmount != null ? Number(rentAmount) : Number(existing.rentAmount);
  const effectiveRate = exchangeRate != null ? Number(exchangeRate) : Number(existing.exchangeRate);
  updates.rentAmountILS = String(effectiveRent * effectiveRate);
}
```

**Why:** Without the pre-fetch, a PATCH that sends only `exchangeRate` leaves `rentAmountILS` stale (it was computed from the original `rentAmount` at creation time and never updated).
