import { NodeSDK } from "@opentelemetry/sdk-node";
import { OTLPTraceExporter } from "@opentelemetry/exporter-otlp-grpc";
import { Resource } from "@opentelemetry/resources";
import { SEMRESATTRS_SERVICE_NAME, SEMRESATTRS_SERVICE_VERSION } from "@opentelemetry/semantic-conventions";
import { HttpInstrumentation } from "@opentelemetry/instrumentation-http";
import { FastifyInstrumentation } from "@opentelemetry/instrumentation-fastify";
import { PgInstrumentation } from "@opentelemetry/instrumentation-pg";
import { ParentBasedSampler, TraceIdRatioBasedSampler } from "@opentelemetry/sdk-trace-base";

export interface SdkOptions {
  serviceName: string;
  serviceVersion?: string;
  /** Sample rate for standard traffic (default 0.1 = 10%) */
  sampleRate?: number;
}

let sdk: NodeSDK | null = null;

export function initTelemetry(options: SdkOptions): void {
  if (sdk) return;

  const endpoint = process.env["OTEL_EXPORTER_OTLP_ENDPOINT"] ?? "http://localhost:4317";

  sdk = new NodeSDK({
    resource: new Resource({
      [SEMRESATTRS_SERVICE_NAME]: options.serviceName,
      [SEMRESATTRS_SERVICE_VERSION]: options.serviceVersion ?? "0.1.0",
    }),
    traceExporter: new OTLPTraceExporter({ url: endpoint }),
    sampler: new ParentBasedSampler({
      root: new TraceIdRatioBasedSampler(options.sampleRate ?? 0.1),
    }),
    instrumentations: [
      new HttpInstrumentation(),
      new FastifyInstrumentation(),
      new PgInstrumentation(),
    ],
  });

  sdk.start();

  process.on("SIGTERM", async () => {
    await sdk?.shutdown();
  });
}
