import type { JwtPayload } from "@campaignos/types";
import { hasPermission, hasDivisionAccess, type Permission } from "./permissions";

export interface AuthContext {
  userId: string;
  email: string;
  role: JwtPayload["role"];
  divisionIds: string[];
}

export class ForbiddenError extends Error {
  readonly status = 403;
  constructor(message = "Forbidden") {
    super(message);
    this.name = "ForbiddenError";
  }
}

export class UnauthorizedError extends Error {
  readonly status = 401;
  constructor(message = "Unauthorized") {
    super(message);
    this.name = "UnauthorizedError";
  }
}

export function requirePermission(
  actor: AuthContext,
  permission: Permission
): void {
  if (!hasPermission(actor.role, permission)) {
    throw new ForbiddenError(
      `Role '${actor.role}' does not have permission '${permission}'`
    );
  }
}

export function requireDivisionAccess(
  actor: AuthContext,
  targetDivisionId: string
): void {
  if (!hasDivisionAccess(actor.divisionIds, targetDivisionId, actor.role)) {
    throw new ForbiddenError(
      `Access to division '${targetDivisionId}' denied`
    );
  }
}

export function requirePermissionAndDivision(
  actor: AuthContext,
  permission: Permission,
  targetDivisionId: string
): void {
  requirePermission(actor, permission);
  requireDivisionAccess(actor, targetDivisionId);
}
