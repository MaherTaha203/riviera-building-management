// ---------------------------------------------------------------------------
// Password hashing (Phase 3).
//
// Production measured bcrypt.compare at ~615ms — the entire cost of a login —
// because `bcryptjs` is a pure-JavaScript implementation running on a
// CPU-constrained host. `@node-rs/bcrypt` is a native Rust binding: ~4-6x
// faster for the same cost factor and it doesn't block the event loop.
//
// We prefer the native binding but fall back to `bcryptjs` if its prebuilt
// binary can't be loaded on the host (unexpected platform/libc). Both read and
// write the standard `$2a`/`$2b` bcrypt format, so hashes are fully
// interchangeable — existing stored password hashes keep verifying either way,
// and no re-hash/migration is required. The fallback makes this change strictly
// safe: worst case it behaves exactly as before.
// ---------------------------------------------------------------------------
import { logger } from "./logger";

interface Hasher {
  hash: (password: string, cost: number) => Promise<string>;
  compare: (password: string, hashed: string) => Promise<boolean>;
}

async function loadHasher(): Promise<Hasher> {
  try {
    const rs = await import("@node-rs/bcrypt");
    logger.info("Password hashing: native @node-rs/bcrypt");
    return {
      hash: (password, cost) => rs.hash(password, cost),
      compare: (password, hashed) => rs.verify(password, hashed),
    };
  } catch (err) {
    logger.warn({ err }, "Native @node-rs/bcrypt unavailable — using bcryptjs fallback");
    const js = (await import("bcryptjs")).default;
    return {
      hash: (password, cost) => js.hash(password, cost),
      compare: (password, hashed) => js.compare(password, hashed),
    };
  }
}

// Resolved once at module load (ESM top-level await), before the server listens.
const hasher = await loadHasher();

/** OWASP-floor cost factor; unchanged from the previous implementation. */
export const BCRYPT_COST = 10;

export function hashPassword(password: string, cost: number = BCRYPT_COST): Promise<string> {
  return hasher.hash(password, cost);
}

export function comparePassword(password: string, hashed: string): Promise<boolean> {
  return hasher.compare(password, hashed);
}
