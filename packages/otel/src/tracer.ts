import { trace, context, SpanStatusCode, type Span, type Attributes } from "@opentelemetry/api";

export function getTracer(name: string) {
  return trace.getTracer(name);
}

export async function withSpan<T>(
  tracerName: string,
  spanName: string,
  attributes: Attributes,
  fn: (span: Span) => Promise<T>
): Promise<T> {
  const tracer = getTracer(tracerName);
  return tracer.startActiveSpan(spanName, { attributes }, async (span) => {
    try {
      const result = await fn(span);
      span.setStatus({ code: SpanStatusCode.OK });
      return result;
    } catch (err) {
      span.setStatus({
        code: SpanStatusCode.ERROR,
        message: err instanceof Error ? err.message : String(err),
      });
      span.recordException(err instanceof Error ? err : new Error(String(err)));
      throw err;
    } finally {
      span.end();
    }
  });
}

export function recordLlmCall(
  span: Span,
  opts: {
    model: string;
    provider: string;
    inputTokens: number;
    outputTokens: number;
    estimatedCostUsd?: number;
  }
): void {
  span.setAttributes({
    "llm.model": opts.model,
    "llm.provider": opts.provider,
    "llm.usage.input_tokens": opts.inputTokens,
    "llm.usage.output_tokens": opts.outputTokens,
    ...(opts.estimatedCostUsd !== undefined && {
      "llm.usage.estimated_cost_usd": opts.estimatedCostUsd,
    }),
  });
}

export function recordAgentRun(
  span: Span,
  opts: {
    agentName: string;
    campaignId: string;
    runId: string;
    iterationCount?: number;
    overallScore?: number;
  }
): void {
  span.setAttributes({
    "agent.name": opts.agentName,
    "agent.campaign_id": opts.campaignId,
    "agent.run_id": opts.runId,
    ...(opts.iterationCount !== undefined && { "agent.iteration_count": opts.iterationCount }),
    ...(opts.overallScore !== undefined && { "agent.overall_score": opts.overallScore }),
  });
}
