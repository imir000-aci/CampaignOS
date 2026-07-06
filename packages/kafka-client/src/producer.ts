import type { Producer } from "kafkajs";
import { v4 as uuidv4 } from "uuid";
import type { KafkaTopic } from "@campaignos/types";
import { getKafkaClient } from "./client";

let _producer: Producer | null = null;

export async function getProducer(): Promise<Producer> {
  if (_producer) return _producer;
  const kafka = getKafkaClient();
  _producer = kafka.producer({
    allowAutoTopicCreation: false,
    idempotent: true,
    maxInFlightRequests: 5,
  });
  await _producer.connect();
  return _producer;
}

export async function publishEvent<T extends Record<string, unknown>>(
  topic: KafkaTopic,
  eventType: string,
  data: T,
  key: string,
  version = 1
): Promise<void> {
  const producer = await getProducer();
  const envelope = {
    eventId: uuidv4(),
    eventType,
    occurredAt: new Date().toISOString(),
    version,
    data,
  };

  await producer.send({
    topic,
    messages: [
      {
        key,
        value: JSON.stringify(envelope),
        headers: {
          "content-type": "application/json",
          "event-type": eventType,
        },
      },
    ],
  });
}

export async function disconnectProducer(): Promise<void> {
  if (_producer) {
    await _producer.disconnect();
    _producer = null;
  }
}
