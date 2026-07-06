import { trace, context } from "@opentelemetry/api";

type LogLevel = "debug" | "info" | "warn" | "error";

interface LogRecord {
  timestamp: string;
  level: LogLevel;
  service: string;
  message: string;
  request_id?: string;
  trace_id?: string;
  span_id?: string;
  actor_id?: string;
  [key: string]: unknown;
}

export function createLogger(service: string) {
  function log(level: LogLevel, message: string, fields?: Record<string, unknown>): void {
    const activeSpan = trace.getActiveSpan();
    const spanContext = activeSpan?.spanContext();

    const record: LogRecord = {
      timestamp: new Date().toISOString(),
      level,
      service,
      message,
      ...(spanContext && {
        trace_id: spanContext.traceId,
        span_id: spanContext.spanId,
      }),
      ...fields,
    };

    const line = JSON.stringify(record);

    if (level === "error" || level === "warn") {
      process.stderr.write(line + "\n");
    } else {
      process.stdout.write(line + "\n");
    }
  }

  return {
    debug: (message: string, fields?: Record<string, unknown>) => log("debug", message, fields),
    info: (message: string, fields?: Record<string, unknown>) => log("info", message, fields),
    warn: (message: string, fields?: Record<string, unknown>) => log("warn", message, fields),
    error: (message: string, fields?: Record<string, unknown>) => log("error", message, fields),
  };
}

export type Logger = ReturnType<typeof createLogger>;
