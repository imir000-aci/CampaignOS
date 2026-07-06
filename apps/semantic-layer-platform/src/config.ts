export const config = {
  port: parseInt(process.env["PORT"] ?? "3110"),
  dbUrl: process.env["POSTGRES_SEMANTIC_URL"] ?? (() => { throw new Error("POSTGRES_SEMANTIC_URL required"); })(),
  jwtSecret: process.env["JWT_SECRET"] ?? (() => { throw new Error("JWT_SECRET required"); })(),
  anthropicApiKey: process.env["ANTHROPIC_API_KEY"],
  nlSqlModel: "claude-haiku-4-5-20251001",
  nlSqlMaxTokens: 1024,
} as const;
