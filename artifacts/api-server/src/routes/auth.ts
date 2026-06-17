import { Router } from "express";
import bcrypt from "bcryptjs";
import { db, usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { signToken, authMiddleware, type JwtPayload } from "../lib/auth";
import { validateBody } from "../lib/validate";
import { LoginBody } from "@workspace/api-zod";

const router = Router();

router.post("/auth/login", validateBody(LoginBody), async (req, res): Promise<void> => {
  const { username, password } = req.body;
  if (!username || !password) {
    res.status(400).json({ error: "Username and password required" });
    return;
  }
  const [user] = await db.select().from(usersTable).where(eq(usersTable.username, username));
  if (!user) {
    res.status(401).json({ error: "Invalid credentials" });
    return;
  }
  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) {
    res.status(401).json({ error: "Invalid credentials" });
    return;
  }
  const token = signToken({ userId: user.id, username: user.username, name: user.name, role: user.role });
  res.json({
    token,
    user: { id: user.id, username: user.username, name: user.name, role: user.role, createdAt: user.createdAt },
  });
});

router.get("/auth/me", authMiddleware, async (req, res): Promise<void> => {
  const user = (req as typeof req & { user: JwtPayload }).user;
  const [dbUser] = await db.select().from(usersTable).where(eq(usersTable.id, user.userId));
  if (!dbUser) {
    res.status(401).json({ error: "User not found" });
    return;
  }
  res.json({ id: dbUser.id, username: dbUser.username, name: dbUser.name, role: dbUser.role, createdAt: dbUser.createdAt });
});

router.post("/auth/logout", (_req, res): void => {
  res.json({ ok: true });
});

export default router;
