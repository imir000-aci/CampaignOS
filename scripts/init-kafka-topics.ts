#!/usr/bin/env tsx
import { getKafkaClient } from "@campaignos/kafka-client";
import { TOPIC_CONFIG } from "@campaignos/kafka-client";

const REPLICATION_FACTOR = parseInt(process.env["KAFKA_REPLICATION_FACTOR"] ?? "1");

async function initTopics(): Promise<void> {
  const kafka = getKafkaClient();
  const admin = kafka.admin();

  await admin.connect();

  try {
    const existing = new Set(await admin.listTopics());
    const missing = Object.entries(TOPIC_CONFIG).filter(([name]) => !existing.has(name));

    if (missing.length === 0) {
      console.log("All Kafka topics already exist.");
      return;
    }

    await admin.createTopics({
      waitForLeaders: true,
      topics: missing.map(([name, cfg]) => ({
        topic: name,
        numPartitions: cfg.partitions,
        replicationFactor: REPLICATION_FACTOR,
        configEntries: [
          { name: "retention.ms", value: String(cfg.retentionMs) },
          { name: "cleanup.policy", value: "delete" },
        ],
      })),
    });

    console.log(`Created ${missing.length} topic(s):`);
    for (const [name] of missing) {
      console.log(`  + ${name}`);
    }
  } finally {
    await admin.disconnect();
  }
}

await initTopics();
