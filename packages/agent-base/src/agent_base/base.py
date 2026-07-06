"""BaseAgent — abstract base class for all CampaignOS AI agents.

Each domain agent (Strategy, Audience, Creative, etc.) inherits from BaseAgent
and implements:
  - `agent_name` property
  - `output_schema` property (Pydantic model)
  - `dimensions` property (critique dimensions list)
  - `config` property (AgentConfig with per-agent defaults)
  - `build_prompt(input)` method — returns (system_prompt, initial_messages)
  - `pre_checks(input)` method — rule-based checks before LLM calls
  - `post_process(output, input)` method — transform raw output if needed

The base class handles:
  - AGENT_LLM_STUB mode
  - Reflect-Critique-Revise loop
  - Cost guard
  - Telemetry emission
  - Run record persistence (to Postgres agent_runs table)
"""
from __future__ import annotations

import logging
import os
import uuid
from abc import ABC, abstractmethod
from datetime import datetime
from typing import Any, TypeVar

from pydantic import BaseModel

from .llm.client import Message
from .llm.stub import get_llm_client
from .loops.cost_guard import CostGuard
from .loops.reflect_critique_revise import ReflectCritiqueReviseLoop
from .schemas import (
    AgentActionTaken,
    AgentConfig,
    AgentInput,
    AgentOutput,
    AgentRunRecord,
    CritiqueResult,
)
from .telemetry.emitter import AgentTelemetryEvent, RunTimer, TelemetryEmitter

T = TypeVar("T", bound=BaseModel)

logger = logging.getLogger(__name__)


class PreCheckError(Exception):
    """Raised by pre_checks() when a rule-based check fails hard."""

    def __init__(self, message: str, check_name: str) -> None:
        super().__init__(message)
        self.check_name = check_name


class BaseAgent(ABC):
    """Abstract base for all CampaignOS agents."""

    # ── Subclass must define these ──────────────────────────────────────────

    @property
    @abstractmethod
    def agent_name(self) -> str:
        """Unique snake_case identifier for this agent (e.g. 'strategy')."""

    @property
    @abstractmethod
    def output_schema(self) -> type[BaseModel]:
        """Pydantic model class that validates the agent's structured output."""

    @property
    @abstractmethod
    def dimensions(self) -> list[str]:
        """Critique dimensions for the intra-agent validation loop."""

    @property
    def default_config(self) -> AgentConfig:
        """Default AgentConfig — override per agent to set model/thresholds."""
        return AgentConfig()

    @abstractmethod
    def build_prompt(self, input: AgentInput) -> tuple[str, list[Message]]:
        """Return (system_prompt, initial_messages) for the agent's main LLM call."""

    def pre_checks(self, input: AgentInput) -> None:
        """Rule-based pre-checks run before any LLM call.

        Raise PreCheckError on hard failures. Soft warnings can be logged.
        Default implementation does nothing — override in subclasses.
        """

    def post_process(self, output: dict[str, Any], input: AgentInput) -> dict[str, Any]:
        """Optional post-processing of validated output. Default: pass-through."""
        return output

    # ── Public interface ────────────────────────────────────────────────────

    def run(self, input: AgentInput) -> AgentOutput:
        """Execute the full agent pipeline for one campaign.

        This is the primary entry point called by both standalone testing
        and the Temporal activity wrapper.
        """
        config = input.config or self.default_config

        # Merge stub mode from env var
        stub_mode = config.stub_mode or os.environ.get("AGENT_LLM_STUB", "").lower() in (
            "1", "true", "yes"
        )

        run_id = str(uuid.uuid4())
        telemetry = TelemetryEmitter(self.agent_name)
        cost_guard = CostGuard(budget_tokens=config.per_run_token_budget)

        with RunTimer() as timer:
            result = self._execute(input, config, stub_mode, cost_guard, run_id)

        # Emit telemetry (non-blocking)
        overall = result.critique.overall_score if result.critique else None
        event = AgentTelemetryEvent(
            run_id=run_id,
            agent_name=self.agent_name,
            campaign_id=input.campaign_id,
            latency_ms=timer.elapsed_ms,
            tokens_in=0,  # filled from LlmUsage if available
            tokens_out=0,
            cost_usd=result.estimated_cost_usd,
            schema_valid=True,
            iterations=result.iterations,
            overall_score=overall,
            action_taken=result.action_taken.value,
            low_confidence=result.low_confidence,
            budget_truncated=result.budget_truncated,
        )
        telemetry.emit(event)

        return AgentOutput(
            agent_name=self.agent_name,
            campaign_id=input.campaign_id,
            run_id=run_id,
            output=result.output,
            critique=result.critique,
            iterations=result.iterations,
            action_taken=result.action_taken,
            low_confidence=result.low_confidence,
            budget_truncated=result.budget_truncated,
            tokens_used=result.tokens_used,
            estimated_cost_usd=result.estimated_cost_usd,
        )

    # ── Internal ────────────────────────────────────────────────────────────

    def _execute(
        self,
        input: AgentInput,
        config: AgentConfig,
        stub_mode: bool,
        cost_guard: CostGuard,
        run_id: str,
    ) -> Any:
        from .loops.reflect_critique_revise import RcrResult

        # Rule-based pre-checks
        try:
            self.pre_checks(input)
        except PreCheckError as e:
            logger.error("%s pre-check failed: %s (%s)", self.agent_name, e, e.check_name)
            # Return escalation result with empty output
            from .loops.reflect_critique_revise import RcrResult
            return RcrResult(
                output={},
                critique=None,
                iterations=0,
                action_taken=AgentActionTaken.ESCALATE,
                low_confidence=True,
                budget_truncated=False,
                tokens_used=0,
                estimated_cost_usd=0.0,
            )

        llm_client = get_llm_client(model=config.model, agent_name=self.agent_name)
        system_prompt, initial_messages = self.build_prompt(input)

        loop = ReflectCritiqueReviseLoop(
            agent_name=self.agent_name,
            output_schema=self.output_schema,
            dimensions=self.dimensions,
            score_threshold=config.score_threshold,
            hard_minimum_score=config.hard_minimum_score,
            max_iterations=config.max_iterations,
            critique_model=config.critique_model,
            cost_guard=cost_guard,
        )

        result = loop.run(
            generate_fn=llm_client.complete,
            initial_messages=initial_messages,
            system_prompt=system_prompt,
        )

        result.output = self.post_process(result.output, input)
        return result

    def to_run_record(
        self,
        output: AgentOutput,
        started_at: datetime,
    ) -> AgentRunRecord:
        return AgentRunRecord(
            run_id=output.run_id,
            campaign_id=output.campaign_id,
            agent_name=output.agent_name,
            status=(
                "ESCALATED" if output.action_taken == AgentActionTaken.ESCALATE else "COMPLETED"
            ),
            iterations=output.iterations,
            overall_score=output.critique.overall_score if output.critique else None,
            action_taken=output.action_taken.value,
            tokens_in=output.tokens_used // 2,  # approximate split
            tokens_out=output.tokens_used // 2,
            estimated_cost_usd=output.estimated_cost_usd,
            low_confidence=output.low_confidence,
            budget_truncated=output.budget_truncated,
            started_at=started_at,
            completed_at=datetime.utcnow(),
        )
