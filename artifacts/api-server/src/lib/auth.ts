import jwt from "jsonwebtoken";
import { Request, Response, NextFunction } from "express";

// Fail fast on a misconfigured deploy: without a signing secret the server would
// still boot and pass health checks, but every login/token verification would
// throw at runtime ("secretOrPrivateKey must have a value"). Mirror the
// DATABASE_URL guard in @workspace/db so misconfiguration is caught at startup.
const secret = process.env.SESSION_SECRET;
if (!secret) {
  throw new Error(
    "SESSION_SECRET must be set. Refusing to start without a JWT signing secret.",
  );
}
const JWT_SECRET: string = secret;

export interface JwtPayload {
  userId: number;
  username: string;
  name: string;
  role: string;
}

export function signToken(payload: JwtPayload): string {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: "7d" });
}

export function verifyToken(token: string): JwtPayload {
  return jwt.verify(token, JWT_SECRET) as JwtPayload;
}

export function authMiddleware(req: Request, res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  const token = authHeader.slice(7);
  try {
    const payload = verifyToken(token);
    (req as Request & { user: JwtPayload }).user = payload;
    next();
  } catch {
    res.status(401).json({ error: "Invalid token" });
  }
}
