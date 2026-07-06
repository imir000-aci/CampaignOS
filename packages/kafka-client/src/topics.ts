export { KAFKA_TOPICS } from "@campaignos/types";
export type { KafkaTopic } from "@campaignos/types";

// Topic partition + retention configuration for admin/init scripts
export const TOPIC_CONFIG: Record<
  string,
  { partitions: number; retentionMs: number }
> = {
  "campaign.created": { partitions: 12, retentionMs: 90 * 24 * 60 * 60 * 1000 },
  "campaign.status.changed": { partitions: 12, retentionMs: 90 * 24 * 60 * 60 * 1000 },
  "campaign.approved": { partitions: 12, retentionMs: 90 * 24 * 60 * 60 * 1000 },
  "campaign.brief.submitted": { partitions: 12, retentionMs: 90 * 24 * 60 * 60 * 1000 },
  "campaign.optimization.applied": { partitions: 12, retentionMs: 90 * 24 * 60 * 60 * 1000 },
  "audience.computed": { partitions: 12, retentionMs: 30 * 24 * 60 * 60 * 1000 },
  "audience.member.added": { partitions: 24, retentionMs: 7 * 24 * 60 * 60 * 1000 },
  "audience.member.removed": { partitions: 24, retentionMs: 7 * 24 * 60 * 60 * 1000 },
  "creative.asset.processed": { partitions: 12, retentionMs: 30 * 24 * 60 * 60 * 1000 },
  "creative.asset.approved": { partitions: 12, retentionMs: 30 * 24 * 60 * 60 * 1000 },
  "offer.redeemed": { partitions: 48, retentionMs: 365 * 24 * 60 * 60 * 1000 },
  "offer.budget.exhausted": { partitions: 12, retentionMs: 30 * 24 * 60 * 60 * 1000 },
  "offer.status.changed": { partitions: 12, retentionMs: 30 * 24 * 60 * 60 * 1000 },
  "activation.job.completed": { partitions: 12, retentionMs: 30 * 24 * 60 * 60 * 1000 },
  "activation.events.tracked": { partitions: 48, retentionMs: 7 * 24 * 60 * 60 * 1000 },
  "measurement.revenue.received": { partitions: 48, retentionMs: 365 * 24 * 60 * 60 * 1000 },
  "measurement.attribution.computed": { partitions: 12, retentionMs: 365 * 24 * 60 * 60 * 1000 },
  "experiment.concluded": { partitions: 12, retentionMs: 90 * 24 * 60 * 60 * 1000 },
  "agent.run.completed": { partitions: 12, retentionMs: 30 * 24 * 60 * 60 * 1000 },
  "agent.telemetry": { partitions: 12, retentionMs: 180 * 24 * 60 * 60 * 1000 },
  "catalog.product.updated": { partitions: 12, retentionMs: 30 * 24 * 60 * 60 * 1000 },
  "catalog.store.updated": { partitions: 6, retentionMs: 30 * 24 * 60 * 60 * 1000 },
  "catalog.banner.updated": { partitions: 6, retentionMs: 30 * 24 * 60 * 60 * 1000 },
};
