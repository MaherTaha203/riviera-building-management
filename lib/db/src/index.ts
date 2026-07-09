import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./schema";

const { Pool } = pg;

if (!process.env.DATABASE_URL) {
  throw new Error(
    "DATABASE_URL must be set. Did you forget to provision a database?",
  );
}

// Pool headroom: the dashboard summary now fans out 7 aggregate queries in
// parallel (plus the dashboard fires 3 endpoints at once), so a single page
// load can briefly hold ~9 connections. The pg default max of 10 left almost
// no room for concurrent users, and this pool is shared with logins/writes —
// so a couple of simultaneous dashboard loads could queue unrelated financial
// requests. Raise the ceiling (well within Neon's connection limit) and add a
// connect timeout so exhaustion fails fast instead of hanging, plus keepAlive
// to avoid idle-connection resets to Neon.
export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 20,
  connectionTimeoutMillis: 10_000,
  keepAlive: true,
});
export const db = drizzle(pool, { schema });

export * from "./schema";
