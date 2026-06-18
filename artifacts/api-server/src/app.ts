import express, { type Express, type Request, type Response } from "express";
import cors from "cors";
import { pinoHttp } from "pino-http";
import router from "./routes";
import { logger } from "./lib/logger";

const app: Express = express();

app.use(
  pinoHttp({
    logger,
    serializers: {
<<<<<<< HEAD
      req(req: { id: unknown; method: string; url?: string }) {
=======
      req(req: Request & { id?: string }) {
>>>>>>> 32e2ae8 (Fix pino-http import for Vercel)
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
<<<<<<< HEAD
      res(res: { statusCode: number }) {
=======
      res(res: Response) {
>>>>>>> 32e2ae8 (Fix pino-http import for Vercel)
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use("/api", router);

export default app;
