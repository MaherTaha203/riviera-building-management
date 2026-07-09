import app from "./app";
import { logger } from "./lib/logger";
import { ensureSchema } from "./lib/ensureSchema";
import { instrumentPool, logBootDbConnect } from "./lib/diag";

const rawPort = process.env["PORT"];
const port = rawPort ? Number(rawPort) : 3000;

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

// Apply the idempotent schema guard BEFORE accepting traffic, so a database
// that missed a migration (e.g. production Neon) is repaired on boot instead
// of serving 500s. If the database is unreachable the process exits loudly —
// the platform restarts it — rather than serving a broken API.
// Diagnostics release: patch the pool for per-request DB timing (no-op when
// DIAG_PERF is unset) before any query runs, then probe boot connect cost.
instrumentPool();

ensureSchema()
  .then(async () => {
    await logBootDbConnect();
    app.listen(port, () => {
      logger.info({ port }, "Server listening");
    });
  })
  .catch((err) => {
    logger.error({ err }, "Schema guard failed — refusing to start");
    process.exit(1);
  });
