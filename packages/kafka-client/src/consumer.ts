import type { Consumer, EachMessagePayload } from "kafkajs";
import type { KafkaTopic, KafkaEventEnvelope } from "@campaignos/types";
import { getKafkaClient } from "./client";

export type MessageHandler<T = Record<string, unknown>> = (
  envelope: KafkaEventEnvelope & { data: T },
  payload: EachMessagePayload
) => Promise<void>;

export interface ConsumerOptions {
  groupId: string;
  topics: KafkaTopic[];
  fromBeginning?: boolean;
  sessionTimeout?: number;
}

export async function createConsumer(
  options: ConsumerOptions,
  handler: MessageHandler
): Promise<{ consumer: Consumer; start: () => Promise<void>; stop: () => Promise<void> }> {
  const kafka = getKafkaClient();

  const consumer = kafka.consumer({
    groupId: options.groupId,
    sessionTimeout: options.sessionTimeout ?? 30000,
    heartbeatInterval: 3000,
  });

  await consumer.connect();
  await consumer.subscribe({
    topics: options.topics,
    fromBeginning: options.fromBeginning ?? false,
  });

  const start = async () => {
    await consumer.run({
      eachMessage: async (payload) => {
        const raw = payload.message.value?.toString();
        if (!raw) return;

        let envelope: KafkaEventEnvelope;
        try {
          envelope = JSON.parse(raw) as KafkaEventEnvelope;
        } catch {
          console.error("Failed to parse Kafka message", { topic: payload.topic, raw });
          return;
        }

        await handler(envelope as KafkaEventEnvelope & { data: Record<string, unknown> }, payload);
      },
    });
  };

  const stop = async () => {
    await consumer.stop();
    await consumer.disconnect();
  };

  return { consumer, start, stop };
}

// Naming convention enforcer: {service}.{topic-group}
export function consumerGroupId(service: string, topicGroup: string): string {
  return `${service}.${topicGroup}`;
}
