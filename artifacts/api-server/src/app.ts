import express, { type Express, type Request, type Response } from "express";
import cors from "cors";
import pinoHttp from "pino-http";
import router from "./routes";
import { logger } from "./lib/logger";

const app: Express = express();

const httpLogger = pinoHttp.default
  ? pinoHttp.default({
      logger,
      serializers: {
        req(req: Request & { id?: string }) {
          return {
            id: req.id,
            method: req.method,
            url: req.url?.split("?")[0],
          };
        },
        res(res: Response) {
          return {
            statusCode: res.statusCode,
          };
        },
      },
    })
  : pinoHttp({
      logger,
      serializers: {
        req(req: Request & { id?: string }) {
          return {
            id: req.id,
            method: req.method,
            url: req.url?.split("?")[0],
          };
        },
        res(res: Response) {
          return {
            statusCode: res.statusCode,
          };
        },
      },
    });

app.use(httpLogger);
