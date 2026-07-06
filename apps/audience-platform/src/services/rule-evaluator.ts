import { eq, and, or, gt, lt, gte, lte, inArray, sql } from "drizzle-orm";
import { getServiceDb, audienceSchema, customerAttributes } from "@campaignos/db-client";
import type { RuleGroup, RuleCondition } from "@campaignos/types";
import { createLogger } from "@campaignos/otel";

const log = createLogger("audience-platform");

type DrizzleCondition = Parameters<typeof and>[0];

function buildCondition(rule: RuleCondition): DrizzleCondition {
  const col = customerAttributes[rule.field as keyof typeof customerAttributes];
  if (!col) {
    log.warn("Unknown rule field", { field: rule.field });
    return sql`true`;
  }

  switch (rule.operator) {
    case "eq": return eq(col as never, rule.value as never);
    case "neq": return sql`${col} != ${rule.value}`;
    case "gt": return gt(col as never, rule.value as never);
    case "lt": return lt(col as never, rule.value as never);
    case "gte": return gte(col as never, rule.value as never);
    case "lte": return lte(col as never, rule.value as never);
    case "in": return inArray(col as never, (rule.value as unknown[]) as never[]);
    case "not_in": return sql`${col} NOT IN (${sql.join((rule.value as unknown[]).map((v) => sql`${v}`), sql`, `)})`;
    case "contains": return sql`${col} ILIKE ${"%" + String(rule.value) + "%"}`;
    default: return sql`true`;
  }
}

function buildGroupCondition(group: RuleGroup): DrizzleCondition {
  const subconditions: DrizzleCondition[] = group.rules.map((rule) => {
    if ("combinator" in rule) {
      return buildGroupCondition(rule as RuleGroup);
    }
    return buildCondition(rule as RuleCondition);
  });

  if (subconditions.length === 0) return sql`true`;
  return group.combinator === "AND"
    ? and(...subconditions)
    : or(...subconditions);
}

export async function estimateAudienceSize(ruleDefinition: RuleGroup): Promise<number> {
  const store = getServiceDb("POSTGRES_AUDIENCE_URL", audienceSchema);
  const condition = buildGroupCondition(ruleDefinition);

  const [result] = await store
    .select({ count: sql<string>`count(*)` })
    .from(customerAttributes)
    .where(condition as never);

  return parseInt(result?.count ?? "0");
}

export interface AudiencePreviewResult {
  estimatedSize: number;
  sampleCustomers: Array<{
    customerId: string;
    loyaltyTier: string | null;
    ageBand: string | null;
    digitalEnrolled: boolean | null;
    preferredBannerId: string | null;
  }>;
  demographicBreakdown: {
    byLoyaltyTier: Record<string, number>;
    byAgeBand: Record<string, number>;
    digitalEnrolledPct: number;
  };
}

export async function previewAudience(ruleDefinition: RuleGroup): Promise<AudiencePreviewResult> {
  const store = getServiceDb("POSTGRES_AUDIENCE_URL", audienceSchema);
  const condition = buildGroupCondition(ruleDefinition);

  const [countResult] = await store
    .select({ count: sql<string>`count(*)` })
    .from(customerAttributes)
    .where(condition as never);

  const estimatedSize = parseInt(countResult?.count ?? "0");

  const sampleRows = await store
    .select({
      customerId: customerAttributes.customerId,
      loyaltyTier: customerAttributes.loyaltyTier,
      ageBand: customerAttributes.ageBand,
      digitalEnrolled: customerAttributes.digitalEnrolled,
      preferredBannerId: customerAttributes.preferredBannerId,
    })
    .from(customerAttributes)
    .where(condition as never)
    .limit(10);

  const breakdownRows = await store
    .select({
      loyaltyTier: customerAttributes.loyaltyTier,
      ageBand: customerAttributes.ageBand,
      digitalEnrolled: customerAttributes.digitalEnrolled,
      count: sql<string>`count(*)`,
    })
    .from(customerAttributes)
    .where(condition as never)
    .groupBy(
      customerAttributes.loyaltyTier,
      customerAttributes.ageBand,
      customerAttributes.digitalEnrolled
    );

  const byLoyaltyTier: Record<string, number> = {};
  const byAgeBand: Record<string, number> = {};
  let digitalCount = 0;

  for (const row of breakdownRows) {
    const count = parseInt(row.count);
    if (row.loyaltyTier) byLoyaltyTier[row.loyaltyTier] = (byLoyaltyTier[row.loyaltyTier] ?? 0) + count;
    if (row.ageBand) byAgeBand[row.ageBand] = (byAgeBand[row.ageBand] ?? 0) + count;
    if (row.digitalEnrolled) digitalCount += count;
  }

  return {
    estimatedSize,
    sampleCustomers: sampleRows,
    demographicBreakdown: {
      byLoyaltyTier,
      byAgeBand,
      digitalEnrolledPct: estimatedSize > 0 ? (digitalCount / estimatedSize) * 100 : 0,
    },
  };
}
