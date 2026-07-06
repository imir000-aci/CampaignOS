import type { FastifyInstance } from "fastify";
import * as argon2 from "argon2";
import { eq, and, isNull, gt } from "drizzle-orm";
import { z } from "zod";
import { getServiceDb } from "@campaignos/db-client";
import { users, refreshTokens } from "@campaignos/db-client";
import { authSchema } from "@campaignos/db-client";
import { buildJwtPayload, generateRefreshToken } from "./tokens";
import { config } from "./config";
import { createLogger } from "@campaignos/otel";

const log = createLogger("auth-service");

const LoginBody = z.object({
  email: z.string().email(),
  password: z.string().min(8),
});

const RefreshBody = z.object({
  refresh_token: z.string(),
});

export async function authRoutes(app: FastifyInstance): Promise<void> {
  const db = getServiceDb("POSTGRES_AUTH_URL", authSchema);

  app.post("/auth/login", async (request, reply) => {
    const body = LoginBody.safeParse(request.body);
    if (!body.success) {
      return reply.status(400).send({ error: "Invalid request body" });
    }

    const [user] = await db
      .select()
      .from(users)
      .where(and(eq(users.email, body.data.email), isNull(users.deletedAt)))
      .limit(1);

    if (!user?.passwordHash) {
      await argon2.verify("$argon2id$v=19$m=65536,t=3,p=4$placeholder", "dummy");
      return reply.status(401).send({ error: "Invalid credentials" });
    }

    const valid = await argon2.verify(user.passwordHash, body.data.password);
    if (!valid) {
      log.warn("Failed login attempt", { email: body.data.email, ip: request.ip });
      return reply.status(401).send({ error: "Invalid credentials" });
    }

    const payload = buildJwtPayload(user as { id: string; email: string; role: string; divisionIds: string[] });
    const accessToken = app.jwt.sign(payload, { expiresIn: config.accessTokenTtlSeconds });
    const { raw, hash } = generateRefreshToken();
    const expiresAt = new Date(Date.now() + config.refreshTokenTtlSeconds * 1000);

    await db.insert(refreshTokens).values({
      userId: user.id,
      tokenHash: hash,
      expiresAt,
      issuedIp: request.ip,
      userAgent: request.headers["user-agent"] ?? null,
    });

    await db
      .update(users)
      .set({ lastLoginAt: new Date() })
      .where(eq(users.id, user.id));

    log.info("User logged in", { userId: user.id });
    return reply.send({ access_token: accessToken, refresh_token: raw, expires_in: config.accessTokenTtlSeconds });
  });

  app.post("/auth/refresh", async (request, reply) => {
    const body = RefreshBody.safeParse(request.body);
    if (!body.success) {
      return reply.status(400).send({ error: "Invalid request body" });
    }

    const { createHash } = await import("crypto");
    const hash = createHash("sha256").update(body.data.refresh_token).digest("hex");

    const [token] = await db
      .select()
      .from(refreshTokens)
      .where(
        and(
          eq(refreshTokens.tokenHash, hash),
          isNull(refreshTokens.revokedAt),
          gt(refreshTokens.expiresAt, new Date())
        )
      )
      .limit(1);

    if (!token) {
      return reply.status(401).send({ error: "Invalid or expired refresh token" });
    }

    const [user] = await db
      .select()
      .from(users)
      .where(and(eq(users.id, token.userId), isNull(users.deletedAt)))
      .limit(1);

    if (!user?.isActive) {
      return reply.status(401).send({ error: "Account inactive" });
    }

    // Rotate: revoke old token, issue new pair
    await db
      .update(refreshTokens)
      .set({ revokedAt: new Date() })
      .where(eq(refreshTokens.id, token.id));

    const payload = buildJwtPayload(user as { id: string; email: string; role: string; divisionIds: string[] });
    const accessToken = app.jwt.sign(payload, { expiresIn: config.accessTokenTtlSeconds });
    const { raw, hash: newHash } = generateRefreshToken();
    const expiresAt = new Date(Date.now() + config.refreshTokenTtlSeconds * 1000);

    await db.insert(refreshTokens).values({
      userId: user.id,
      tokenHash: newHash,
      expiresAt,
      issuedIp: request.ip,
      userAgent: request.headers["user-agent"] ?? null,
    });

    return reply.send({ access_token: accessToken, refresh_token: raw, expires_in: config.accessTokenTtlSeconds });
  });

  app.post("/auth/logout", { onRequest: [app.authenticate] }, async (request, reply) => {
    const { createHash } = await import("crypto");
    const body = RefreshBody.safeParse(request.body);
    if (body.success) {
      const hash = createHash("sha256").update(body.data.refresh_token).digest("hex");
      await db
        .update(refreshTokens)
        .set({ revokedAt: new Date() })
        .where(eq(refreshTokens.tokenHash, hash));
    }
    return reply.status(204).send();
  });

  app.get("/auth/me", { onRequest: [app.authenticate] }, async (request, reply) => {
    const jwt = request.user as { sub: string };
    const [user] = await db
      .select({ id: users.id, email: users.email, name: users.name, role: users.role, divisionIds: users.divisionIds })
      .from(users)
      .where(eq(users.id, jwt.sub))
      .limit(1);

    if (!user) return reply.status(404).send({ error: "User not found" });
    return reply.send(user);
  });
}
