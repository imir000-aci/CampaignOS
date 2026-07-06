import crypto from "crypto";
import type { FastifyJWT } from "@fastify/jwt";
import type { JwtPayload } from "@campaignos/types";

export function generateRefreshToken(): { raw: string; hash: string } {
  const raw = crypto.randomBytes(48).toString("base64url");
  const hash = crypto.createHash("sha256").update(raw).digest("hex");
  return { raw, hash };
}

export function buildJwtPayload(user: {
  id: string;
  email: string;
  role: string;
  divisionIds: string[];
}): JwtPayload {
  return {
    sub: user.id,
    email: user.email,
    role: user.role as JwtPayload["role"],
    division_ids: user.divisionIds,
  };
}
