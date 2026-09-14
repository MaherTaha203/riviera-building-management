// ---------------------------------------------------------------------------
// Notices / alerts (Phase 2, slice 10). Read-only, computed operational alerts:
//   * contracts expiring within a horizon (active, endDate in [today, today+N])
//   * tenants with overdue receivables (past-due buckets of the aging report)
// Nothing here writes. Powers the arrears / notices dashboard.
// ---------------------------------------------------------------------------
import { db, contractsTable, tenantsTable, unitsTable } from "@workspace/db";
import { and, asc, eq, gte, lte } from "drizzle-orm";
import { agingReport } from "./reports";

type Exec = typeof db | Parameters<Parameters<typeof db.transaction>[0]>[0];

export interface ExpiringContract {
  contractId: number;
  contractNumber: string;
  tenantId: number;
  tenantName: string | null;
  unitId: number;
  unitNumber: string | null;
  endDate: string;
  daysToExpiry: number;
}

export interface OverdueTenant {
  tenantId: number;
  tenantName: string | null;
  overdueILS: number;   // past-due only (excludes not-yet-due "current")
  totalDueILS: number;  // whole outstanding incl. current
}

export interface Notices {
  asOf: string;
  expiryHorizonDays: number;
  expiringContracts: ExpiringContract[];
  overdueTenants: OverdueTenant[];
  counts: { expiring: number; overdue: number };
}

const addDaysStr = (dateStr: string, n: number): string => {
  const [y, m, d] = dateStr.split("-").map(Number);
  const base = new Date(Date.UTC(y, m - 1, d));
  base.setUTCDate(base.getUTCDate() + n);
  return base.toISOString().slice(0, 10);
};
const daysBetween = (a: string, b: string): number => {
  const [ay, am, ad] = a.split("-").map(Number);
  const [by, bm, bd] = b.split("-").map(Number);
  return Math.round((Date.UTC(by, bm - 1, bd) - Date.UTC(ay, am - 1, ad)) / 86400000);
};

export async function computeNotices(exec: Exec = db, opts: { asOf?: string; expiryHorizonDays?: number } = {}): Promise<Notices> {
  const asOf = opts.asOf ?? new Date().toISOString().slice(0, 10);
  const horizonDays = opts.expiryHorizonDays ?? 60;
  const horizon = addDaysStr(asOf, horizonDays);

  const rows = await exec
    .select({
      contractId: contractsTable.id,
      contractNumber: contractsTable.contractNumber,
      tenantId: contractsTable.tenantId,
      tenantName: tenantsTable.name,
      unitId: contractsTable.unitId,
      unitNumber: unitsTable.unitNumber,
      endDate: contractsTable.endDate,
    })
    .from(contractsTable)
    .leftJoin(tenantsTable, eq(tenantsTable.id, contractsTable.tenantId))
    .leftJoin(unitsTable, eq(unitsTable.id, contractsTable.unitId))
    .where(and(eq(contractsTable.status, "active"), gte(contractsTable.endDate, asOf), lte(contractsTable.endDate, horizon)))
    .orderBy(asc(contractsTable.endDate));

  const expiringContracts: ExpiringContract[] = rows.map((r) => ({
    ...r, tenantName: r.tenantName ?? null, unitNumber: r.unitNumber ?? null,
    daysToExpiry: daysBetween(asOf, r.endDate),
  }));

  // Overdue tenants from the aging report: past-due = total − current.
  const aging = await agingReport(exec, asOf);
  const overdueTenants: OverdueTenant[] = aging.rows
    .map((r) => ({ tenantId: r.tenantId, tenantName: r.tenantName, overdueILS: Math.round((r.total - r.current) * 100) / 100, totalDueILS: r.total }))
    .filter((r) => r.overdueILS > 0.005)
    .sort((a, b) => b.overdueILS - a.overdueILS);

  return {
    asOf, expiryHorizonDays: horizonDays,
    expiringContracts, overdueTenants,
    counts: { expiring: expiringContracts.length, overdue: overdueTenants.length },
  };
}
