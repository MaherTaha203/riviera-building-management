import type { Request, Response, NextFunction } from "express";

/**
 * Centralized error handler.
 *
 * Without this, any thrown/rejected error in a route (Express 5 forwards async
 * rejections here automatically) falls through to Express's default handler,
 * which returns an opaque `500 Internal Server Error` HTML page. In particular a
 * duplicate-key insert (e.g. re-using a unit number) surfaced to the user as a
 * generic 500 instead of a clear "already exists" message.
 *
 * This handler maps known PostgreSQL error codes to clean JSON responses and
 * guarantees every error response is JSON, never HTML.
 */

interface PgError {
  code?: string;
  constraint?: string;
  detail?: string;
  table?: string;
}

// Drizzle wraps the driver error; the real pg error is reachable via `.cause`.
function findPgError(err: unknown): PgError | null {
  let cursor: unknown = err;
  for (let depth = 0; depth < 5 && cursor && typeof cursor === "object"; depth++) {
    const code = (cursor as PgError).code;
    if (typeof code === "string" && /^[0-9A-Z]{5}$/.test(code)) {
      return cursor as PgError;
    }
    cursor = (cursor as { cause?: unknown }).cause;
  }
  return null;
}

// Friendly Arabic messages for the unique constraints in the schema.
const UNIQUE_MESSAGES: Record<string, string> = {
  units_unit_number_unique: "رقم الوحدة موجود مسبقاً",
  users_username_unique: "اسم المستخدم موجود مسبقاً",
  contracts_contract_number_unique: "رقم العقد موجود مسبقاً",
  receipt_vouchers_voucher_number_unique: "رقم سند القبض موجود مسبقاً",
  payment_vouchers_voucher_number_unique: "رقم سند الصرف موجود مسبقاً",
};

export function errorHandler(
  err: unknown,
  req: Request,
  res: Response,
  // The 4-arg arity is what marks this as an Express error handler — keep it.
  _next: NextFunction,
): void {
  if (res.headersSent) {
    return;
  }

  const pg = findPgError(err);

  if (pg?.code === "23505") {
    // unique_violation
    const message = (pg.constraint && UNIQUE_MESSAGES[pg.constraint]) || "القيمة موجودة مسبقاً";
    res.status(409).json({ error: message });
    return;
  }

  if (pg?.code === "23503") {
    // foreign_key_violation
    res.status(409).json({ error: "لا يمكن إتمام العملية لارتباط السجل بسجلات أخرى" });
    return;
  }

  if (pg?.code === "23502" || pg?.code === "23514") {
    // not_null_violation / check_violation
    res.status(400).json({ error: "بيانات غير صالحة" });
    return;
  }

  // Body-parser and other errors that carry an explicit HTTP status (e.g.
  // PayloadTooLargeError 413, malformed JSON 400) — surface it as clean JSON
  // instead of a generic 500.
  const status = (err as { status?: number; statusCode?: number })?.status
    ?? (err as { statusCode?: number })?.statusCode;
  if (typeof status === "number" && status >= 400 && status < 500) {
    const message = status === 413
      ? "حجم الملف كبير جداً"
      : status === 400
        ? "طلب غير صالح"
        : "تعذّر إتمام الطلب";
    res.status(status).json({ error: message });
    return;
  }

  req.log?.error({ err }, "Unhandled error");
  res.status(500).json({ error: "Internal Server Error" });
}
