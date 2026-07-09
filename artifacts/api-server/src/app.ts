import express, { type Express, type Request, type Response } from "express";
import cors from "cors";
import { pinoHttp } from "pino-http";
import router from "./routes";
import { logger } from "./lib/logger";
import { errorHandler } from "./lib/errorHandler";
import { DIAG, diagMiddleware } from "./lib/diag";

const app: Express = express();

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req: { id: unknown; method: string; url?: string }) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res: { statusCode: number }) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);

// Diagnostics release: expose the Server-Timing header to cross-origin readers
// (the Vercel frontend) only while the flag is on. Otherwise plain CORS.
app.use(cors(DIAG ? { exposedHeaders: ["Server-Timing"] } : {}));
// Documents are stored as base64 data URIs (see replit.md), so the JSON body
// limit must accommodate encoded files. 25mb allows ~18MB original files.
app.use(express.json({ limit: "25mb" }));
app.use(express.urlencoded({ extended: true, limit: "25mb" }));

// Request-scoped diagnostics (no-op passthrough when DIAG_PERF is unset).
app.use("/api", diagMiddleware);
app.use("/api", router);

// Centralized error handler — must be registered last, after all routes.
app.use(errorHandler);

export default app;
