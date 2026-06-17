import { Router } from "express";
import { db, settingsTable, exchangeRatesTable, usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import bcrypt from "bcryptjs";
import { authMiddleware, type JwtPayload } from "../lib/auth";
import { logAction } from "../lib/audit";
import { validateBody } from "../lib/validate";
import { UpdateSettingsBody, UpdateExchangeRatesBody, CreateUserBody, UpdateUserBody } from "@workspace/api-zod";

const router = Router();

// Settings
router.get("/settings", authMiddleware, async (_req, res): Promise<void> => {
  let [s] = await db.select().from(settingsTable);
  if (!s) {
    [s] = await db.insert(settingsTable).values({}).returning();
  }
  res.json(s);
});

router.patch("/settings", authMiddleware, validateBody(UpdateSettingsBody), async (req, res): Promise<void> => {
  const user = (req as typeof req & { user: JwtPayload }).user;
  const [s] = await db.select().from(settingsTable);
  const { buildingName, buildingAddress, defaultCurrency, phone, email, taxNumber } = req.body;
  const updates: Record<string, unknown> = {};
  if (buildingName != null) updates.buildingName = buildingName;
  if (buildingAddress != null) updates.buildingAddress = buildingAddress;
  if (defaultCurrency != null) updates.defaultCurrency = defaultCurrency;
  if (phone !== undefined) updates.phone = phone;
  if (email !== undefined) updates.email = email;
  if (taxNumber !== undefined) updates.taxNumber = taxNumber;
  let updated;
  if (s) {
    [updated] = await db.update(settingsTable).set(updates).where(eq(settingsTable.id, s.id)).returning();
  } else {
    [updated] = await db.insert(settingsTable).values(updates).returning();
  }
  await logAction(user, "UPDATE", "settings");
  res.json(updated);
});

// Exchange rates
router.get("/settings/exchange-rates", authMiddleware, async (_req, res): Promise<void> => {
  let [r] = await db.select().from(exchangeRatesTable);
  if (!r) {
    [r] = await db.insert(exchangeRatesTable).values({}).returning();
  }
  res.json({ usdToILS: Number(r.usdToILS), jodToILS: Number(r.jodToILS), updatedAt: r.updatedAt });
});

router.patch("/settings/exchange-rates", authMiddleware, validateBody(UpdateExchangeRatesBody), async (req, res): Promise<void> => {
  const user = (req as typeof req & { user: JwtPayload }).user;
  const { usdToILS, jodToILS } = req.body;
  const [r] = await db.select().from(exchangeRatesTable);
  let updated;
  if (r) {
    [updated] = await db.update(exchangeRatesTable).set({ usdToILS: String(usdToILS), jodToILS: String(jodToILS) }).where(eq(exchangeRatesTable.id, r.id)).returning();
  } else {
    [updated] = await db.insert(exchangeRatesTable).values({ usdToILS: String(usdToILS), jodToILS: String(jodToILS) }).returning();
  }
  await logAction(user, "UPDATE", "exchange_rates");
  res.json({ usdToILS: Number(updated.usdToILS), jodToILS: Number(updated.jodToILS), updatedAt: updated.updatedAt });
});

// Users
router.get("/settings/users", authMiddleware, async (_req, res): Promise<void> => {
  const users = await db.select({ id: usersTable.id, username: usersTable.username, name: usersTable.name, role: usersTable.role, createdAt: usersTable.createdAt }).from(usersTable);
  res.json(users);
});

router.post("/settings/users", authMiddleware, validateBody(CreateUserBody), async (req, res): Promise<void> => {
  const user = (req as typeof req & { user: JwtPayload }).user;
  const { username, name, password, role } = req.body;
  if (!username || !name || !password || !role) {
    res.status(400).json({ error: "Missing required fields" });
    return;
  }
  const passwordHash = await bcrypt.hash(password, 10);
  const [newUser] = await db.insert(usersTable).values({ username, name, passwordHash, role }).returning();
  await logAction(user, "CREATE", "user", newUser.id);
  res.status(201).json({ id: newUser.id, username: newUser.username, name: newUser.name, role: newUser.role, createdAt: newUser.createdAt });
});

router.patch("/settings/users/:id", authMiddleware, validateBody(UpdateUserBody), async (req, res): Promise<void> => {
  const user = (req as typeof req & { user: JwtPayload }).user;
  const id = parseInt(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id, 10);
  const { name, password, role } = req.body;
  const updates: Record<string, unknown> = {};
  if (name != null) updates.name = name;
  if (role != null) updates.role = role;
  if (password) updates.passwordHash = await bcrypt.hash(password, 10);
  const [u] = await db.update(usersTable).set(updates).where(eq(usersTable.id, id)).returning();
  if (!u) { res.status(404).json({ error: "User not found" }); return; }
  await logAction(user, "UPDATE", "user", u.id);
  res.json({ id: u.id, username: u.username, name: u.name, role: u.role, createdAt: u.createdAt });
});

router.delete("/settings/users/:id", authMiddleware, async (req, res): Promise<void> => {
  const user = (req as typeof req & { user: JwtPayload }).user;
  const id = parseInt(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id, 10);
  if (id === user.userId) {
    res.status(400).json({ error: "Cannot delete your own account" });
    return;
  }
  const [u] = await db.delete(usersTable).where(eq(usersTable.id, id)).returning();
  if (!u) { res.status(404).json({ error: "User not found" }); return; }
  await logAction(user, "DELETE", "user", u.id);
  res.sendStatus(204);
});

export default router;
