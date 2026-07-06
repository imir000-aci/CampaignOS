export const config = {
  port: parseInt(process.env["PORT"] ?? "3200"),
  jwtSecret: process.env["JWT_SECRET"] ?? (() => { throw new Error("JWT_SECRET is required"); })(),
  accessTokenTtlSeconds: 60 * 60,         // 1 hour
  refreshTokenTtlSeconds: 7 * 24 * 60 * 60, // 7 days
  dbUrl: process.env["POSTGRES_AUTH_URL"] ?? (() => { throw new Error("POSTGRES_AUTH_URL is required"); })(),
} as const;
