import { pgTable, varchar, text, timestamp, boolean, jsonb, uuid, pgEnum, unique } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { baseColumns } from "../columns";

export const rbacRoleEnum = pgEnum("rbac_role", [
  "ADMIN", "CAMPAIGN_MANAGER", "CREATIVE_APPROVER", "ANALYST", "VIEWER",
]);

export const users = pgTable("users", {
  ...baseColumns,
  email: varchar("email", { length: 255 }).notNull().unique(),
  name: varchar("name", { length: 255 }).notNull(),
  role: rbacRoleEnum("role").notNull().default("VIEWER"),
  divisionIds: jsonb("division_ids").$type<string[]>().notNull().default(sql`'[]'::jsonb`),
  isActive: boolean("is_active").notNull().default(true),
  lastLoginAt: timestamp("last_login_at", { withTimezone: true }),
  passwordHash: varchar("password_hash", { length: 255 }),
});

export const refreshTokens = pgTable("refresh_tokens", {
  ...baseColumns,
  userId: uuid("user_id").notNull().references(() => users.id),
  tokenHash: varchar("token_hash", { length: 255 }).notNull().unique(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  revokedAt: timestamp("revoked_at", { withTimezone: true }),
  issuedIp: varchar("issued_ip", { length: 45 }),
  userAgent: text("user_agent"),
});

export const serviceTokens = pgTable("service_tokens", {
  ...baseColumns,
  serviceName: varchar("service_name", { length: 100 }).notNull().unique(),
  tokenHash: varchar("token_hash", { length: 255 }).notNull(),
  isActive: boolean("is_active").notNull().default(true),
  lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
});

export const authSchema = {
  users,
  refreshTokens,
  serviceTokens,
};
