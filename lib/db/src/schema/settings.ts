import { pgTable, text, serial, timestamp, numeric } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const settingsTable = pgTable("settings", {
  id: serial("id").primaryKey(),
  buildingName: text("building_name").notNull().default("Riviera Commercial Building"),
  buildingAddress: text("building_address").notNull().default(""),
  defaultCurrency: text("default_currency").notNull().default("ILS"),
  phone: text("phone"),
  email: text("email"),
  taxNumber: text("tax_number"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const exchangeRatesTable = pgTable("exchange_rates", {
  id: serial("id").primaryKey(),
  usdToILS: numeric("usd_to_ils", { precision: 10, scale: 4 }).notNull().default("3.7"),
  jodToILS: numeric("jod_to_ils", { precision: 10, scale: 4 }).notNull().default("5.22"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertSettingsSchema = createInsertSchema(settingsTable).omit({ id: true, updatedAt: true });
export type InsertSettings = z.infer<typeof insertSettingsSchema>;
export type Settings = typeof settingsTable.$inferSelect;
