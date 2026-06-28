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

/**
 * Authorize by role. Must be used AFTER authMiddleware (which populates req.user).
 * Responds 403 when the authenticated user's role is not in the allowed set.
 */
export function requireRole(...roles: string[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const user = (req as Request & { user?: JwtPayload }).user;
    if (!user || !roles.includes(user.role)) {
      res.status(403).json({ error: "ليس لديك صلاحية للقيام بهذا الإجراء" });
      return;
    }
    next();
  };
}

/**
 * Global guard: make `viewer` accounts read-only. Applied once at the top of the
 * API router. Lets all safe methods (GET/HEAD/OPTIONS) and the auth endpoints
 * (login/logout) through; for any other write it rejects viewers with 403.
 * Invalid/absent tokens are left for the downstream authMiddleware to handle.
 */
export function blockViewerWrites(req: Request, res: Response, next: NextFunction): void {
  const safe = req.method === "GET" || req.method === "HEAD" || req.method === "OPTIONS";
  if (safe || req.path.startsWith("/auth/")) {
    next();
    return;
  }
  const authHeader = req.headers.authorization;
  if (authHeader?.startsWith("Bearer ")) {
    try {
      const payload = verifyToken(authHeader.slice(7));
      if (payload.role === "viewer") {
        res.status(403).json({ error: "حسابك للاطّلاع فقط ولا يمكنه إجراء تعديلات" });
        return;
      }
    } catch {
      // Leave invalid-token handling to authMiddleware on the matched route.
    }
  }
  next();
}
