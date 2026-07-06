import { z } from "zod";
import { UuidSchema } from "./shared";

export const EntityTypeSchema = z.enum([
  "Campaign",
  "Audience",
  "Customer",
  "Offer",
  "Product",
  "Bundle",
  "Store",
  "Division",
  "Banner",
  "CreativeAsset",
  "Experience",
  "Experiment",
  "RevenueEvent",
]);
export type EntityType = z.infer<typeof EntityTypeSchema>;

export const ResolvedEntitySchema = z.object({
  type: EntityTypeSchema,
  id: UuidSchema,
  displayName: z.string(),
  attributes: z.record(z.unknown()),
  relationships: z.array(z.object({
    type: z.string(),
    targetType: EntityTypeSchema,
    targetId: UuidSchema,
    targetDisplayName: z.string(),
  })).optional(),
});
export type ResolvedEntity = z.infer<typeof ResolvedEntitySchema>;

export const EntityResolutionRequestSchema = z.object({
  identifiers: z.array(z.object({
    type: EntityTypeSchema,
    value: z.string(),
    idType: z.enum(["UUID", "EXTERNAL_ID", "NAME", "SKU"]).default("UUID"),
  })).min(1).max(100),
});
export type EntityResolutionRequest = z.infer<typeof EntityResolutionRequestSchema>;

export const NaturalLanguageQuerySchema = z.object({
  query: z.string().min(1),
  context: z.record(z.unknown()).optional(),
  dryRun: z.boolean().default(false),
});
export type NaturalLanguageQueryInput = z.infer<typeof NaturalLanguageQuerySchema>;

export const NaturalLanguageQueryResultSchema = z.object({
  query: z.string(),
  generatedSql: z.string(),
  validationPassed: z.boolean(),
  results: z.array(z.record(z.unknown())).nullable(),
  rowCount: z.number().int().nonnegative().nullable(),
  executionTimeMs: z.number().nonnegative().nullable(),
  warnings: z.array(z.string()),
});
export type NaturalLanguageQueryResult = z.infer<typeof NaturalLanguageQueryResultSchema>;

export const MetricDefinitionSchema = z.object({
  name: z.string(),
  displayName: z.string(),
  formula: z.string().nullable(),
  unit: z.string(),
  description: z.string(),
  category: z.enum(["DELIVERY", "ENGAGEMENT", "CONVERSION", "REVENUE", "EFFICIENCY"]),
});
export type MetricDefinition = z.infer<typeof MetricDefinitionSchema>;
