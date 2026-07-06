import type { CampaignStatus, RbacRole } from "@campaignos/types";

type TransitionMap = Map<CampaignStatus, {
  to: CampaignStatus[];
  requiredPermission: string;
  systemOnly?: boolean;
}>;

// Valid transitions. systemOnly = can only be driven by Temporal/agent, not direct user API call.
export const TRANSITIONS: TransitionMap = new Map([
  ["DRAFT", {
    to: ["PLANNING", "ARCHIVED"],
    requiredPermission: "campaigns:edit",
  }],
  ["PLANNING", {
    to: ["PENDING_APPROVAL", "DRAFT", "CREATION_FAILED"],
    requiredPermission: "campaigns:edit",
    systemOnly: false,
  }],
  ["PENDING_APPROVAL", {
    to: ["APPROVED", "REJECTED", "DRAFT"],
    requiredPermission: "campaigns:approve",
  }],
  ["APPROVED", {
    to: ["ACTIVE", "DRAFT"],
    requiredPermission: "campaigns:launch",
  }],
  ["ACTIVE", {
    to: ["PAUSED", "COMPLETED"],
    requiredPermission: "campaigns:edit",
  }],
  ["PAUSED", {
    to: ["ACTIVE", "COMPLETED", "ARCHIVED"],
    requiredPermission: "campaigns:edit",
  }],
  ["COMPLETED", {
    to: ["ARCHIVED"],
    requiredPermission: "campaigns:edit",
  }],
  ["REJECTED", {
    to: ["DRAFT", "ARCHIVED"],
    requiredPermission: "campaigns:edit",
  }],
  ["CREATION_FAILED", {
    to: ["DRAFT", "ARCHIVED"],
    requiredPermission: "campaigns:edit",
  }],
  ["ARCHIVED", {
    to: [],
    requiredPermission: "campaigns:edit",
  }],
]);

export function isValidTransition(from: CampaignStatus, to: CampaignStatus): boolean {
  return TRANSITIONS.get(from)?.to.includes(to) ?? false;
}

export function getRequiredPermission(from: CampaignStatus): string {
  return TRANSITIONS.get(from)?.requiredPermission ?? "campaigns:edit";
}

// Maps user-facing action names to target statuses
export const ACTION_MAP: Record<string, CampaignStatus> = {
  submit: "PENDING_APPROVAL",
  approve: "APPROVED",
  reject: "REJECTED",
  launch: "ACTIVE",
  pause: "PAUSED",
  resume: "ACTIVE",
  complete: "COMPLETED",
  archive: "ARCHIVED",
};
