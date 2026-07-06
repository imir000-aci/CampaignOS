#!/usr/bin/env tsx
/**
 * Seeds canonical entity definitions and metric definitions into semantic_db.
 * Run once after migrations: npm run seed:definitions
 */
import { getServiceDb, entityDefinitions, metricDefinitions, semanticSchema } from "@campaignos/db-client";
import { sql } from "drizzle-orm";

const db = getServiceDb("POSTGRES_SEMANTIC_URL", semanticSchema);

const ENTITY_DEFS = [
  {
    entityType: "CUSTOMER" as const,
    name: "Customer",
    description: "A loyalty member or shopper tracked by CampaignOS",
    ownerService: "audience-platform",
    attributes: {
      customerId: { type: "string", description: "Unique customer identifier from loyalty system" },
      loyaltyTier: { type: "enum", values: ["BRONZE", "SILVER", "GOLD", "PLATINUM"] },
      lifetimeValueCents: { type: "integer", description: "Total lifetime spend in cents" },
      daysSinceLastPurchase: { type: "integer" },
      preferredBannerId: { type: "string", description: "Banner where customer shops most" },
      ageBand: { type: "enum", values: ["18-24", "25-34", "35-44", "45-54", "55-64", "65+"] },
      hasChildren: { type: "boolean" },
      zipCode: { type: "string" },
      digitalEnrolled: { type: "boolean", description: "Enrolled in digital coupons/app" },
    },
    relationships: {
      PURCHASED: { target: "Product", cardinality: "many" },
      REDEEMED: { target: "Offer", cardinality: "many" },
      MEMBER_OF: { target: "Audience", cardinality: "many" },
      SHOPS_AT: { target: "Store", cardinality: "many" },
    },
    version: 1,
  },
  {
    entityType: "PRODUCT" as const,
    name: "Product",
    description: "A SKU in the product catalog",
    ownerService: "upstream-catalog",
    attributes: {
      productId: { type: "string" },
      name: { type: "string" },
      category: { type: "string" },
      subcategory: { type: "string" },
      priceCents: { type: "integer" },
      status: { type: "enum", values: ["ACTIVE", "DISCONTINUED"] },
      bannerAvailability: { type: "array", items: "string" },
    },
    relationships: {
      IN_CATEGORY: { target: "Category", cardinality: "one" },
      FREQUENTLY_BOUGHT_WITH: { target: "Product", cardinality: "many" },
      SIMILAR_TO: { target: "Product", cardinality: "many" },
    },
    version: 1,
  },
  {
    entityType: "OFFER" as const,
    name: "Offer",
    description: "A discount or promotion offer",
    ownerService: "offer-platform",
    attributes: {
      offerId: { type: "string" },
      name: { type: "string" },
      offerType: { type: "enum", values: ["PERCENT_OFF", "DOLLAR_OFF", "BOGO", "FREE_ITEM", "POINTS_MULTIPLIER"] },
      status: { type: "enum", values: ["DRAFT", "ACTIVE", "PAUSED", "EXPIRED", "ARCHIVED"] },
      discountValue: { type: "integer", description: "Percentage or cents depending on type" },
      budgetTotalCents: { type: "integer" },
      budgetRemainingCents: { type: "integer" },
    },
    relationships: {
      APPLIES_TO_CATEGORY: { target: "Category", cardinality: "many" },
    },
    version: 1,
  },
  {
    entityType: "CAMPAIGN" as const,
    name: "Campaign",
    description: "A marketing campaign in CampaignOS",
    ownerService: "strategy-platform",
    attributes: {
      campaignId: { type: "string" },
      name: { type: "string" },
      status: { type: "enum", values: ["DRAFT", "PLANNING", "PENDING_APPROVAL", "APPROVED", "ACTIVE", "PAUSED", "COMPLETED", "REJECTED"] },
      objective: { type: "enum", values: ["AWARENESS", "CONSIDERATION", "CONVERSION", "RETENTION", "LOYALTY", "WINBACK"] },
      budgetTotalCents: { type: "integer" },
      channelMix: { type: "array", items: "string" },
    },
    relationships: {
      TARGETS: { target: "Audience", cardinality: "many" },
      DEPENDS_ON: { target: "Campaign", cardinality: "many" },
    },
    version: 1,
  },
  {
    entityType: "STORE" as const,
    name: "Store",
    description: "A physical retail store location",
    ownerService: "upstream-store-ops",
    attributes: {
      storeId: { type: "string" },
      name: { type: "string" },
      bannerId: { type: "string" },
      divisionId: { type: "string" },
      zipCode: { type: "string" },
      city: { type: "string" },
      state: { type: "string" },
    },
    relationships: {
      IN_BANNER: { target: "Banner", cardinality: "one" },
    },
    version: 1,
  },
  {
    entityType: "AUDIENCE" as const,
    name: "Audience",
    description: "A defined segment of customers",
    ownerService: "audience-platform",
    attributes: {
      audienceId: { type: "string" },
      name: { type: "string" },
      audienceType: { type: "enum", values: ["RULE_BASED", "AI_GENERATED", "LOOKALIKE", "UPLOAD", "COMPOSITE"] },
      status: { type: "enum", values: ["DRAFT", "COMPUTING", "READY", "STALE", "ARCHIVED"] },
      estimatedSize: { type: "integer" },
    },
    relationships: {
      DERIVED_FROM: { target: "Audience", cardinality: "one" },
      SUPPRESSES: { target: "Audience", cardinality: "many" },
    },
    version: 1,
  },
  {
    entityType: "DIVISION" as const,
    name: "Division",
    description: "An organizational division grouping multiple banners",
    ownerService: "upstream-org",
    attributes: {
      divisionId: { type: "string" },
      name: { type: "string" },
    },
    relationships: {},
    version: 1,
  },
  {
    entityType: "BANNER" as const,
    name: "Banner",
    description: "A retail banner (brand) under a division",
    ownerService: "upstream-org",
    attributes: {
      bannerId: { type: "string" },
      name: { type: "string" },
      divisionId: { type: "string" },
    },
    relationships: {
      PART_OF_DIVISION: { target: "Division", cardinality: "one" },
    },
    version: 1,
  },
  {
    entityType: "CATEGORY" as const,
    name: "Category",
    description: "A product category in the retail taxonomy",
    ownerService: "upstream-catalog",
    attributes: {
      categoryId: { type: "string" },
      name: { type: "string" },
      parentCategoryId: { type: "string", nullable: true },
      level: { type: "integer", description: "Depth in category hierarchy (0 = root)" },
    },
    relationships: {
      SUBCATEGORY_OF: { target: "Category", cardinality: "one" },
    },
    version: 1,
  },
];

const METRIC_DEFS = [
  {
    name: "roas",
    displayName: "Return on Ad Spend (ROAS)",
    description: "Attributed revenue divided by media spend",
    formula: "attributed_revenue / media_spend",
    unit: "ratio",
    dataSources: ["measurement_rollups", "campaign_attributions"],
    relatedEntityTypes: ["CAMPAIGN"],
    sqlTemplate: `SELECT campaign_id,
  SUM(attributed_revenue_cents)::float / NULLIF(SUM(spend_cents), 0) AS roas
FROM measurement_rollups
WHERE campaign_id = :campaign_id
GROUP BY campaign_id`,
  },
  {
    name: "ctr",
    displayName: "Click-Through Rate (CTR)",
    description: "Clicks divided by impressions",
    formula: "clicks / impressions",
    unit: "percentage",
    dataSources: ["measurement_rollups"],
    relatedEntityTypes: ["CAMPAIGN"],
    sqlTemplate: `SELECT campaign_id, channel,
  SUM(clicks)::float / NULLIF(SUM(impressions), 0) * 100 AS ctr_pct
FROM measurement_rollups
WHERE campaign_id = :campaign_id
GROUP BY campaign_id, channel`,
  },
  {
    name: "conversion_rate",
    displayName: "Conversion Rate",
    description: "Conversions divided by impressions",
    formula: "conversions / impressions",
    unit: "percentage",
    dataSources: ["measurement_rollups"],
    relatedEntityTypes: ["CAMPAIGN"],
    sqlTemplate: `SELECT campaign_id,
  SUM(conversions)::float / NULLIF(SUM(impressions), 0) * 100 AS conversion_rate_pct
FROM measurement_rollups WHERE campaign_id = :campaign_id GROUP BY campaign_id`,
  },
  {
    name: "incremental_lift",
    displayName: "Incremental Revenue Lift",
    description: "Percentage revenue increase in test group vs control",
    formula: "(test_revenue - control_revenue) / control_revenue",
    unit: "percentage",
    dataSources: ["lift_studies"],
    relatedEntityTypes: ["CAMPAIGN"],
    sqlTemplate: `SELECT campaign_id, study_type, incremental_lift_pct, p_value, is_significant
FROM lift_studies WHERE campaign_id = :campaign_id`,
  },
  {
    name: "offer_redemption_rate",
    displayName: "Offer Redemption Rate",
    description: "Unique customers who redeemed / unique customers targeted",
    formula: "unique_redeemers / audience_size",
    unit: "percentage",
    dataSources: ["offer_redemptions", "audience_members"],
    relatedEntityTypes: ["OFFER", "CAMPAIGN"],
    sqlTemplate: `SELECT o.id AS offer_id, o.name,
  COUNT(DISTINCT r.customer_id)::float / NULLIF(a.estimated_size, 0) * 100 AS redemption_rate_pct
FROM offers o
LEFT JOIN offer_redemptions r ON r.offer_id = o.id
LEFT JOIN audiences a ON a.campaign_id = :campaign_id
WHERE o.id = :offer_id GROUP BY o.id, o.name, a.estimated_size`,
  },
  {
    name: "audience_reach",
    displayName: "Audience Reach",
    description: "Estimated number of unique customers the campaign will reach",
    formula: "SUM(targeting_config.estimated_reach)",
    unit: "count",
    dataSources: ["targeting_configs"],
    relatedEntityTypes: ["CAMPAIGN", "AUDIENCE"],
    sqlTemplate: `SELECT campaign_id, SUM(estimated_reach) AS total_reach
FROM targeting_configs WHERE campaign_id = :campaign_id AND deleted_at IS NULL
GROUP BY campaign_id`,
  },
  {
    name: "budget_utilization",
    displayName: "Budget Utilization",
    description: "Media spend to date as a percentage of total media budget",
    formula: "spend_to_date / budget_media",
    unit: "percentage",
    dataSources: ["measurement_rollups", "campaigns"],
    relatedEntityTypes: ["CAMPAIGN"],
    sqlTemplate: `SELECT c.id, c.name,
  SUM(r.spend_cents)::float / NULLIF(c.budget_media_cents, 0) * 100 AS utilization_pct
FROM campaigns c
LEFT JOIN measurement_rollups r ON r.campaign_id = c.id
WHERE c.id = :campaign_id
GROUP BY c.id, c.name, c.budget_media_cents`,
  },
];

async function seedDefinitions(): Promise<void> {
  console.log("Seeding entity definitions...");

  for (const def of ENTITY_DEFS) {
    await db
      .insert(entityDefinitions)
      .values({
        entityType: def.entityType,
        name: def.name,
        description: def.description,
        ownerService: def.ownerService,
        attributes: def.attributes,
        relationships: def.relationships,
        version: def.version,
      })
      .onConflictDoUpdate({
        target: entityDefinitions.id,
        set: {
          attributes: sql`EXCLUDED.attributes`,
          relationships: sql`EXCLUDED.relationships`,
          version: sql`EXCLUDED.version`,
          updatedAt: sql`now()`,
        },
      });
    console.log(`  ✓ ${def.entityType}`);
  }

  console.log("\nSeeding metric definitions...");

  for (const metric of METRIC_DEFS) {
    await db
      .insert(metricDefinitions)
      .values({
        name: metric.name,
        displayName: metric.displayName,
        description: metric.description,
        formula: metric.formula,
        unit: metric.unit,
        dataSources: metric.dataSources,
        relatedEntityTypes: metric.relatedEntityTypes,
        sqlTemplate: metric.sqlTemplate,
        isPublic: true,
      })
      .onConflictDoUpdate({
        target: metricDefinitions.name,
        set: {
          displayName: sql`EXCLUDED.display_name`,
          description: sql`EXCLUDED.description`,
          formula: sql`EXCLUDED.formula`,
          sqlTemplate: sql`EXCLUDED.sql_template`,
          updatedAt: sql`now()`,
        },
      });
    console.log(`  ✓ ${metric.name}`);
  }

  console.log("\nDone.");
  process.exit(0);
}

await seedDefinitions();
