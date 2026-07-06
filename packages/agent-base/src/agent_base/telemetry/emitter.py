"""Telemetry emitter for agent runs — publishes to OTel and Kafka agent_telemetry topic."""
from __future__ import annotations

import logging
import os
import time
from datetime import datetime
from typing import Any

from pydantic import BaseModel

logger = logging.getLogger(__name__)

# OTel span attribute names (follow semantic conventions)
ATTR_AGENT_NAME = "agent.name"
ATTR_AGENT_RUN_ID = "agent.run_id"
ATTR_CAMPAIGN_ID = "campaign.id"
ATTR_ITERATIONS = "agent.iterations"
ATTR_OVERALL_SCORE = "agent.overall_score"
ATTR_ACTION_TAKEN = "agent.action_taken"
ATTR_TOKENS_IN = "llm.input_tokens"
ATTR_TOKENS_OUT = "llm.output_tokens"
ATTR_COST_USD = "llm.estimated_cost_usd"
ATTR_LOW_CONFIDENCE = "agent.low_confidence"
ATTR_BUDGET_TRUNCATED = "agent.budget_truncated"


class AgentTelemetryEvent(BaseModel):
    run_id: str
    agent_name: str
    campaign_id: str
    latency_ms: int
    tokens_in: int
    tokens_out: int
    cost_usd: float
    schema_valid: bool
    iterations: int
    overall_score: float | None
    action_taken: str
    low_confidence: bool
    budget_truncated: bool
    human_gate_outcome: str | None = None
    error: str | None = None
    occurred_at: str = ""

    def model_post_init(self, __context: Any) -> None:
        if not self.occurred_at:
            self.occurred_at = datetime.utcnow().isoformat() + "Z"


class TelemetryEmitter:
    """Emits agent run telemetry to OTel spans and (optionally) Kafka.

    Kafka publishing is fire-and-forget — failures are logged but do not
    propagate to the agent, since telemetry must never block agent execution.
    """

    def __init__(self, agent_name: str) -> None:
        self.agent_name = agent_name
        self._otel_available = self._check_otel()
        self._kafka_available = self._check_kafka()

    def _check_otel(self) -> bool:
        try:
            from opentelemetry import trace  # noqa: F401
            return True
        except ImportError:
            return False

    def _check_kafka(self) -> bool:
        return bool(os.environ.get("KAFKA_BROKERS"))

    def emit(self, event: AgentTelemetryEvent) -> None:
        """Emit telemetry event to OTel and Kafka."""
        self._emit_otel(event)
        self._emit_kafka(event)

    def _emit_otel(self, event: AgentTelemetryEvent) -> None:
        if not self._otel_available:
            return
        try:
            from opentelemetry import trace
            tracer = trace.get_tracer("campaignos.agents")
            with tracer.start_as_current_span(f"agent.run.{self.agent_name}") as span:
                span.set_attribute(ATTR_AGENT_NAME, event.agent_name)
                span.set_attribute(ATTR_AGENT_RUN_ID, event.run_id)
                span.set_attribute(ATTR_CAMPAIGN_ID, event.campaign_id)
                span.set_attribute(ATTR_ITERATIONS, event.iterations)
                span.set_attribute(ATTR_ACTION_TAKEN, event.action_taken)
                span.set_attribute(ATTR_TOKENS_IN, event.tokens_in)
                span.set_attribute(ATTR_TOKENS_OUT, event.tokens_out)
                span.set_attribute(ATTR_COST_USD, event.cost_usd)
                span.set_attribute(ATTR_LOW_CONFIDENCE, event.low_confidence)
                span.set_attribute(ATTR_BUDGET_TRUNCATED, event.budget_truncated)
                if event.overall_score is not None:
                    span.set_attribute(ATTR_OVERALL_SCORE, event.overall_score)
                if event.error:
                    span.set_status(
                        trace.status.Status(trace.status.StatusCode.ERROR, event.error)
                    )
        except Exception as e:
            logger.debug("OTel emit failed (non-fatal): %s", e)

    def _emit_kafka(self, event: AgentTelemetryEvent) -> None:
        if not self._kafka_available:
            return
        try:
            import json
            from kafka import KafkaProducer  # type: ignore[import]
            producer = KafkaProducer(
                bootstrap_servers=os.environ["KAFKA_BROKERS"].split(","),
                value_serializer=lambda v: json.dumps(v).encode(),
            )
            producer.send("agent.telemetry", value=event.model_dump())
            producer.flush(timeout=2)
        except Exception as e:
            logger.debug("Kafka telemetry emit failed (non-fatal): %s", e)


class RunTimer:
    """Context manager for timing agent runs."""

    def __init__(self) -> None:
        self._start: float = 0.0
        self.elapsed_ms: int = 0

    def __enter__(self) -> "RunTimer":
        self._start = time.monotonic()
        return self

    def __exit__(self, *args: Any) -> None:
        self.elapsed_ms = int((time.monotonic() - self._start) * 1000)
