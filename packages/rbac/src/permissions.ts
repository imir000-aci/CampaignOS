import type { RbacRole } from "@campaignos/types";

// ─── Permission Strings ───────────────────────────────────────────────────────────
// Format: resource:action

export const PERMISSIONS = {
  // Campaigns
  CAMPAIGNS_READ: "campaigns:read",
  CAMPAIGNS_CREATE: "campaigns:create",
  CAMPAIGNS_UPDATE: "campaigns:update",
  CAMPAIGNS_DELETE: "campaigns:delete",
  CAMPAIGNS_SUBMIT: "campaigns:submit",
  CAMPAIGNS_APPROVE: "campaigns:approve",
  CAMPAIGNS_REJECT: "campaigns:reject",
  CAMPAIGNS_LAUNCH: "campaigns:launch",
  CAMPAIGNS_PAUSE: "campaigns:pause",
  CAMPAIGNS_ARCHIVE: "campaigns:archive",
  CAMPAIGNS_DUPLICATE: "campaigns:duplicate",

  // Audiences
  AUDIENCES_READ: "audiences:read",
  AUDIENCES_CREATE: "audiences:create",
  AUDIENCES_UPDATE: "audiences:update",
  AUDIENCES_DELETE: "audiences:delete",

  // Creatives
  CREATIVES_READ: "creatives:read",
  CREATIVES_CREATE: "creatives:create",
  CREATIVES_UPDATE: "creatives:update",
  CREATIVES_DELETE: "creatives:delete",
  CREATIVES_APPROVE: "creatives:approve",
  CREATIVES_GENERATE: "creatives:generate",

  // Offers
  OFFERS_READ: "offers:read",
  OFFERS_CREATE: "offers:create",
  OFFERS_UPDATE: "offers:update",
  OFFERS_DELETE: "offers:delete",

  // Experiments
  EXPERIMENTS_READ: "experiments:read",
  EXPERIMENTS_CREATE: "experiments:create",
  EXPERIMENTS_UPDATE: "experiments:update",
  EXPERIMENTS_CONCLUDE: "experiments:conclude",

  // Measurement
  MEASUREMENT_READ: "measurement:read",
  MEASUREMENT_INGEST: "measurement:ingest",

  // Agents
  AGENTS_READ: "agents:read",
  AGENTS_TRIGGER: "agents:trigger",
  AGENTS_APPROVE: "agents:approve",
  AGENTS_CANCEL: "agents:cancel",

  // Monitoring
  MONITORING_READ: "monitoring:read",
  COSTS_READ: "costs:read",

  // Admin
  ADMIN_USERS: "admin:users",
  ADMIN_SYSTEM: "admin:system",
  ADMIN_INTEGRATIONS: "admin:integrations",
  ADMIN_SEED: "admin:seed",
} as const;

export type Permission = (typeof PERMISSIONS)[keyof typeof PERMISSIONS];

// ─── Role → Permission Matrix ─────────────────────────────────────────────────────

const ALL_PERMISSIONS = Object.values(PERMISSIONS) as Permission[];

const ROLE_PERMISSIONS: Record<RbacRole, Permission[]> = {
  ADMIN: ALL_PERMISSIONS,

  CAMPAIGN_MANAGER: [
    PERMISSIONS.CAMPAIGNS_READ,
    PERMISSIONS.CAMPAIGNS_CREATE,
    PERMISSIONS.CAMPAIGNS_UPDATE,
    PERMISSIONS.CAMPAIGNS_SUBMIT,
    PERMISSIONS.CAMPAIGNS_DUPLICATE,
    PERMISSIONS.CAMPAIGNS_PAUSE,
    PERMISSIONS.CAMPAIGNS_ARCHIVE,
    PERMISSIONS.AUDIENCES_READ,
    PERMISSIONS.AUDIENCES_CREATE,
    PERMISSIONS.AUDIENCES_UPDATE,
    PERMISSIONS.AUDIENCES_DELETE,
    PERMISSIONS.CREATIVES_READ,
    PERMISSIONS.CREATIVES_CREATE,
    PERMISSIONS.CREATIVES_UPDATE,
    PERMISSIONS.CREATIVES_GENERATE,
    PERMISSIONS.OFFERS_READ,
    PERMISSIONS.OFFERS_CREATE,
    PERMISSIONS.OFFERS_UPDATE,
    PERMISSIONS.EXPERIMENTS_READ,
    PERMISSIONS.EXPERIMENTS_CREATE,
    PERMISSIONS.EXPERIMENTS_UPDATE,
    PERMISSIONS.MEASUREMENT_READ,
    PERMISSIONS.AGENTS_READ,
    PERMISSIONS.AGENTS_TRIGGER,
    PERMISSIONS.AGENTS_APPROVE,
    PERMISSIONS.AGENTS_CANCEL,
  ],

  CREATIVE_APPROVER: [
    PERMISSIONS.CAMPAIGNS_READ,
    PERMISSIONS.CAMPAIGNS_APPROVE,
    PERMISSIONS.CAMPAIGNS_REJECT,
    PERMISSIONS.CAMPAIGNS_LAUNCH,
    PERMISSIONS.CREATIVES_READ,
    PERMISSIONS.CREATIVES_APPROVE,
    PERMISSIONS.AUDIENCES_READ,
    PERMISSIONS.OFFERS_READ,
    PERMISSIONS.EXPERIMENTS_READ,
    PERMISSIONS.MEASUREMENT_READ,
    PERMISSIONS.AGENTS_READ,
    PERMISSIONS.AGENTS_APPROVE,
  ],

  ANALYST: [
    PERMISSIONS.CAMPAIGNS_READ,
    PERMISSIONS.AUDIENCES_READ,
    PERMISSIONS.CREATIVES_READ,
    PERMISSIONS.OFFERS_READ,
    PERMISSIONS.EXPERIMENTS_READ,
    PERMISSIONS.MEASUREMENT_READ,
    PERMISSIONS.AGENTS_READ,
    PERMISSIONS.MONITORING_READ,
    PERMISSIONS.COSTS_READ,
  ],

  VIEWER: [
    PERMISSIONS.CAMPAIGNS_READ,
    PERMISSIONS.AUDIENCES_READ,
    PERMISSIONS.CREATIVES_READ,
    PERMISSIONS.OFFERS_READ,
    PERMISSIONS.EXPERIMENTS_READ,
    PERMISSIONS.MEASUREMENT_READ,
  ],
};

// ─── Permission Check Functions ──────────────────────────────────────────────────

export function hasPermission(role: RbacRole, permission: Permission): boolean {
  return ROLE_PERMISSIONS[role]?.includes(permission) ?? false;
}

export function hasAnyPermission(role: RbacRole, permissions: Permission[]): boolean {
  return permissions.some((p) => hasPermission(role, p));
}

export function hasAllPermissions(role: RbacRole, permissions: Permission[]): boolean {
  return permissions.every((p) => hasPermission(role, p));
}

export function getPermissionsForRole(role: RbacRole): Permission[] {
  return ROLE_PERMISSIONS[role] ?? [];
}

// ─── Division Scope Enforcement ─────────────────────────────────────────────────────
// Called alongside hasPermission; checks that the actor has access to the target division.

export function hasDivisionAccess(
  actorDivisionIds: string[],
  targetDivisionId: string,
  role: RbacRole
): boolean {
  // ADMINs bypass division scoping
  if (role === "ADMIN") return true;
  return actorDivisionIds.includes(targetDivisionId);
}
