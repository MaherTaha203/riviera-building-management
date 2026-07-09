import type { QueryClient } from "@tanstack/react-query";

/**
 * Financial cache invalidation (Phase 2).
 *
 * Balances and dashboard aggregates in this app are denormalized and
 * cross-entity: a single receipt/payment voucher changes the tenant balance,
 * the cash fund, the bank/summary totals, the account statement, and the
 * activity log — not just its own list. Previously each page invalidated only
 * its own query key, which was masked by `staleTime: 0` (every navigation
 * refetched everything). Now that Phase 2 introduces a real `staleTime` for
 * de-duplication, that masking is gone, so a financial write MUST refresh the
 * whole cluster or the UI would show stale balances/counts until the stale
 * window expires.
 *
 * Keys are prefix-matched by TanStack Query, so param-keyed queries
 * (`/api/cheques?type=…`, `/api/account-statements?…`) are covered by their
 * base path. Note `/api/cash-fund/transactions` is a distinct key from
 * `/api/cash-fund` and must be listed on its own.
 */
const FINANCIAL_QUERY_KEYS: readonly string[] = [
  "/api/dashboard/summary",
  "/api/dashboard/recent-activity",
  "/api/dashboard/latest-receipts",
  "/api/receipt-vouchers",
  "/api/payment-vouchers",
  "/api/cash-fund",
  "/api/cash-fund/transactions",
  "/api/bank-accounts",
  "/api/cheques",
  "/api/tenants",
  "/api/contracts",
  "/api/units",
  "/api/account-statements",
  "/api/audit-log",
];

/**
 * Invalidate every query whose data can change as a side effect of a financial
 * write. Call this from the `onSuccess` of any voucher / cheque / contract /
 * tenant / unit / bank-account mutation so post-write data is always fresh
 * regardless of `staleTime`. Fire-and-forget friendly (returns a promise for
 * callers that want to await the refetch).
 */
export function invalidateFinancial(qc: QueryClient): Promise<void> {
  return Promise.all(
    FINANCIAL_QUERY_KEYS.map((key) => qc.invalidateQueries({ queryKey: [key] })),
  ).then(() => undefined);
}
