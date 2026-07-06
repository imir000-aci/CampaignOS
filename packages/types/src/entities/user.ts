import { z } from "zod";
import { BaseEntitySchema, UuidSchema } from "./shared";

export const RbacRoleSchema = z.enum([
  "ADMIN",
  "CAMPAIGN_MANAGER",
  "CREATIVE_APPROVER",
  "ANALYST",
  "VIEWER",
]);
export type RbacRole = z.infer<typeof RbacRoleSchema>;

export const UserSchema = BaseEntitySchema.extend({
  email: z.string().email(),
  firstName: z.string().min(1),
  lastName: z.string().min(1),
  role: RbacRoleSchema,
  divisionIds: z.array(UuidSchema).min(1),
  isActive: z.boolean().default(true),
  lastLoginAt: z.string().datetime({ offset: true }).nullable(),
});
export type User = z.infer<typeof UserSchema>;

export const JwtPayloadSchema = z.object({
  sub: UuidSchema,
  email: z.string().email(),
  role: RbacRoleSchema,
  division_ids: z.array(UuidSchema),
  iat: z.number().int(),
  exp: z.number().int(),
  jti: z.string(),
});
export type JwtPayload = z.infer<typeof JwtPayloadSchema>;

export const TokenPairSchema = z.object({
  accessToken: z.string(),
  refreshToken: z.string(),
  expiresIn: z.number().int(),
  tokenType: z.literal("Bearer"),
});
export type TokenPair = z.infer<typeof TokenPairSchema>;

export const LoginRequestSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
});
export type LoginRequest = z.infer<typeof LoginRequestSchema>;

export const RefreshTokenRequestSchema = z.object({
  refreshToken: z.string(),
});
export type RefreshTokenRequest = z.infer<typeof RefreshTokenRequestSchema>;
