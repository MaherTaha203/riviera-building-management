// ---------------------------------------------------------------------------
// Receivables smoke (Phase 1, slice 10). Deterministic regression guard for
// rent-charge generation + FIFO allocation against a live Postgres. Provisions
// its own tenant/unit/contract, then asserts generation counts, tenant amount
// due, FIFO allocation, and de-allocation. Run against a freshly migrated DB.
//
//   DATABASE_URL=… tsx src/smoke/receivablesSmoke.ts
// ---------------------------------------------------------------------------
import { db, pool, usersTable, tenantsTable, unitsTable, contractsTable, receiptVouchersTable } from "@workspace/db";
import { sql } from "drizzle-orm";
import { generateChargesForContract, tenantAmountDueILS, allocateReceiptFIFO, deallocateReceipt } from "../lib/receivables";

let failures = 0;
const ok = (label: string, actual: number, expected: number) => {
  const good = Math.abs(actual - expected) < 0.005;
  console.log(`  ${good ? "✓" : "✗"} ${label}: ${actual} (expect ${expected})`);
  if (!good) failures++;
};

async function main() {
  await db.execute(sql`insert into users (id,username,password_hash,name,role) values (1,'recv','x','Smoke','admin') on conflict (id) do nothing`);
  const [t] = await db.insert(tenantsTable).values({ name: "مستأجر الاختبار", phone: "0" }).returning();
  const [u] = await db.insert(unitsTable).values({ unitNumber: "SMOKE-A1", type: "apartment", area: "100", floor: "1", status: "occupied" } as typeof unitsTable.$inferInsert).returning();
  const [c] = await db.insert(contractsTable).values({
    contractNumber: "SMOKE-C1", tenantId: t.id, unitId: u.id,
    startDate: "2026-01-01", endDate: "2026-12-31",
    rentAmount: "1000", currency: "ILS", exchangeRate: "1", rentAmountILS: "1000",
    paymentFrequency: "monthly", status: "active",
  }).returning();

  console.log("receivables smoke\n");

  const created = await db.transaction((tx) => generateChargesForContract(tx, c, "2026-03-15", 1));
  ok("charges generated up to 2026-03-15 (Jan/Feb/Mar)", created.length, 3);
  ok("tenant amount due after generation", await tenantAmountDueILS(db, t.id), 3000);

  const again = await db.transaction((tx) => generateChargesForContract(tx, c, "2026-03-15", 1));
  ok("re-generation is idempotent (0 new)", again.length, 0);

  const [r1] = await db.insert(receiptVouchersTable).values({ voucherNumber: "SMOKE-R1", date: "2026-01-05", payerName: "م", tenantId: t.id, amount: "1500", currency: "ILS", exchangeRate: "1", amountILS: "1500", paymentMethod: "cash" }).returning();
  const a1 = await db.transaction((tx) => allocateReceiptFIFO(tx, { receiptVoucherId: r1.id, tenantId: t.id, amountILS: 1500 }));
  ok("receipt 1 allocated (FIFO)", a1, 1500);
  ok("tenant due after paying 1500", await tenantAmountDueILS(db, t.id), 1500);

  const [r2] = await db.insert(receiptVouchersTable).values({ voucherNumber: "SMOKE-R2", date: "2026-02-05", payerName: "م", tenantId: t.id, amount: "2000", currency: "ILS", exchangeRate: "1", amountILS: "2000", paymentMethod: "cash" }).returning();
  const a2 = await db.transaction((tx) => allocateReceiptFIFO(tx, { receiptVoucherId: r2.id, tenantId: t.id, amountILS: 2000 }));
  ok("receipt 2 allocates only the 1500 still open", a2, 1500);
  ok("tenant due after full settlement", await tenantAmountDueILS(db, t.id), 0);

  await db.transaction((tx) => deallocateReceipt(tx, r1.id));
  ok("tenant due after de-allocating receipt 1", await tenantAmountDueILS(db, t.id), 1500);

  console.log(failures === 0 ? "\n✓ receivables smoke passed" : `\n✗ receivables smoke failed (${failures})`);
  await pool.end();
  process.exit(failures === 0 ? 0 : 1);
}

main().catch(async (e) => {
  console.error("smoke crashed:", e);
  try { await pool.end(); } catch { /* ignore */ }
  process.exit(1);
});
