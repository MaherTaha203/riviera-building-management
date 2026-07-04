import app from "./app";
import { logger } from "./lib/logger";
import { ensureSchema } from "./lib/ensureSchema";

const rawPort = process.env["PORT"];
const port = rawPort ? Number(rawPort) : 3000;

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

// Apply the idempotent schema guard BEFORE accepting traffic, so a database
// that missed a migration (e.g. production Neon) is repaired on boot instead
// of serving 500s. If the database is unreachable the process exits loudly —
// the platform restarts it — rather than serving a broken API.
ensureSchema()
  .then(() => {
    app.listen(port, () => {
      logger.info({ port }, "Server listening");
    });
  })
  .catch((err) => {
    logger.error({ err }, "Schema guard failed — refusing to start");
    process.exit(1);
  });
