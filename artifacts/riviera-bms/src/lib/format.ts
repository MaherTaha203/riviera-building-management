import { format } from "date-fns";

export function formatAmount(amount: number, currency: "ILS" | "USD" | "JOD" | string = "ILS"): string {
  const symbol = currency === "ILS" ? "₪" : currency === "USD" ? "$" : currency === "JOD" ? "JD" : currency;
  return `${symbol} ${amount.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function formatDate(dateStr: string | Date | undefined | null): string {
  if (!dateStr) return "-";
  try {
    return format(new Date(dateStr), "yyyy-MM-dd");
  } catch (e) {
    return String(dateStr);
  }
}

export function formatVoucherNumber(num: string | number): string {
  return String(num);
}
