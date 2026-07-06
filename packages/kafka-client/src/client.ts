import { Kafka, type KafkaConfig, logLevel } from "kafkajs";

let _kafka: Kafka | null = null;

export function getKafkaClient(config?: Partial<KafkaConfig>): Kafka {
  if (_kafka) return _kafka;

  const brokers = (process.env["KAFKA_BROKERS"] ?? "localhost:9092").split(",");

  _kafka = new Kafka({
    clientId: process.env["KAFKA_CLIENT_ID"] ?? "campaignos",
    brokers,
    logLevel: logLevel.WARN,
    retry: {
      initialRetryTime: 100,
      retries: 8,
    },
    ...config,
  });

  return _kafka;
}
