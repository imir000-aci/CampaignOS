"""CampaignCreationWorkflow — Temporal workflow for the full campaign creation pipeline.

Execution order (per architecture plan Section 3.2):
  1. StrategyAgent (sequential)
  2. [WAIT: StrategyReviewSignal] — Gate 1 human approval
  3. AudienceAgent (sequential)
  4. [CreativeAgent || TargetingAgent] (parallel)
  5. ExperienceAgent (sequential, after both Creative + Targeting complete)
  6. [ExperimentAgent || MeasurementAgent] (parallel)
  7. ValidationAgent (sequential, after both Experiment + Measurement complete)
  8. PreviewAgent (sequential)
  9. [WAIT: PreviewReviewSignal] — Gate 2 human approval
 10. FinalizeCampaignDraft → emit campaign.ready event

Signals:
  - StrategyReviewSignal{approved: bool, reviewer_id: str, comments: str}
  - PreviewReviewSignal{approved: bool, reviewer_id: str, comments: str}
  - AbortCampaignSignal{reason: str}

Queries:
  - get_status → CampaignCreationStatus
  - get_agent_output(agent_name) → dict | None
"""
from __future__ import annotations

import asyncio
import logging
from dataclasses import dataclass, field
from datetime import timedelta
from typing import Any

from temporalio import workflow
from temporalio.common import RetryPolicy

with workflow.unsafe.imports_passed_through():
    from src.activities.agent_activities import (
        AgentActivityInput,
        run_audience_agent,
        run_creative_agent,
        run_experience_agent,
        run_experiment_agent,
        run_measurement_agent,
        run_preview_agent,
        run_strategy_agent,
        run_targeting_agent,
        run_validation_agent,
    )

logger = logging.getLogger(__name__)

# Activity retry policy — LLM calls are retried on transient errors
_AGENT_RETRY = RetryPolicy(
    initial_interval=timedelta(seconds=2),
    maximum_interval=timedelta(seconds=60),
    maximum_attempts=5,
    non_retryable_error_types=["PreCheckError", "SchemaValidationError"],
)

_ACTIVITY_TIMEOUT = timedelta(minutes=10)  # per-agent timeout


@dataclass
class HumanReviewSignal:
    approved: bool
    reviewer_id: str = ""
    comments: str = ""


@dataclass
class AbortSignal:
    reason: str


@dataclass
class CampaignCreationInput:
    campaign_id: str
    stub_mode: bool = False


@dataclass
class CampaignCreationStatus:
    campaign_id: str
    current_step: str
    agent_outputs: dict[str, bool] = field(default_factory=dict)  # agent_name → completed
    gate1_approved: bool | None = None
    gate2_approved: bool | None = None
    aborted: bool = False
    abort_reason: str = ""
    finalized: bool = False


@workflow.defn
class CampaignCreationWorkflow:
    """Durable campaign creation workflow with parallel agent execution and human gates."""

    def __init__(self) -> None:
        self._status = CampaignCreationStatus(campaign_id="", current_step="INITIALIZING")
        self._agent_outputs: dict[str, Any] = {}
        # Gate signals
        self._strategy_review: HumanReviewSignal | None = None
        self._preview_review: HumanReviewSignal | None = None
        self._abort: AbortSignal | None = None

    # ── Signals ──────────────────────────────────────────────────────────────

    @workflow.signal
    async def strategy_review_signal(self, signal: HumanReviewSignal) -> None:
        self._strategy_review = signal

    @workflow.signal
    async def preview_review_signal(self, signal: HumanReviewSignal) -> None:
        self._preview_review = signal

    @workflow.signal
    async def abort_campaign_signal(self, signal: AbortSignal) -> None:
        self._abort = signal

    # ── Queries ───────────────────────────────────────────────────────────────

    @workflow.query
    def get_status(self) -> CampaignCreationStatus:
        return self._status

    @workflow.query
    def get_agent_output(self, agent_name: str) -> dict[str, Any] | None:
        return self._agent_outputs.get(agent_name)

    # ── Main execution ────────────────────────────────────────────────────────

    @workflow.run
    async def run(self, params: CampaignCreationInput) -> CampaignCreationStatus:
        self._status.campaign_id = params.campaign_id
        stub = params.stub_mode

        def _make_input(agent_name: str) -> AgentActivityInput:
            return AgentActivityInput(
                campaign_id=params.campaign_id,
                upstream_outputs=dict(self._agent_outputs),
                stub_mode=stub,
            )

        async def _run_activity(activity_fn, agent_name: str) -> None:
            self._status.current_step = agent_name.upper()
            output = await workflow.execute_activity(
                activity_fn,
                _make_input(agent_name),
                start_to_close_timeout=_ACTIVITY_TIMEOUT,
                retry_policy=_AGENT_RETRY,
            )
            self._agent_outputs[agent_name] = output
            self._status.agent_outputs[agent_name] = True

        # ── Check for abort at any step ───────────────────────────────────────
        def _check_abort() -> bool:
            if self._abort:
                self._status.aborted = True
                self._status.abort_reason = self._abort.reason
                return True
            return False

        # Step 1: Strategy
        await _run_activity(run_strategy_agent, "strategy")
        if _check_abort():
            return self._status

        # Gate 1: Human strategy review
        self._status.current_step = "AWAITING_STRATEGY_REVIEW"
        await workflow.wait_condition(
            lambda: self._strategy_review is not None or self._abort is not None,
            timeout=timedelta(hours=24),
        )
        if _check_abort():
            return self._status
        if self._strategy_review and not self._strategy_review.approved:
            self._status.gate1_approved = False
            self._status.current_step = "STRATEGY_REJECTED"
            return self._status
        self._status.gate1_approved = True

        # Step 3: Audience
        await _run_activity(run_audience_agent, "audience")
        if _check_abort():
            return self._status

        # Steps 4a+4b: Creative || Targeting (parallel)
        self._status.current_step = "CREATIVE_TARGETING_PARALLEL"
        await asyncio.gather(
            _run_activity(run_creative_agent, "creative"),
            _run_activity(run_targeting_agent, "targeting"),
        )
        if _check_abort():
            return self._status

        # Step 5: Experience
        await _run_activity(run_experience_agent, "experience")
        if _check_abort():
            return self._status

        # Steps 6a+6b: Experiment || Measurement (parallel)
        self._status.current_step = "EXPERIMENT_MEASUREMENT_PARALLEL"
        await asyncio.gather(
            _run_activity(run_experiment_agent, "experiment"),
            _run_activity(run_measurement_agent, "measurement"),
        )
        if _check_abort():
            return self._status

        # Step 7: Validation
        await _run_activity(run_validation_agent, "validation")
        if _check_abort():
            return self._status

        # Check if validation blocks launch
        validation_output = self._agent_outputs.get("validation", {})
        if validation_output.get("overall_status") == "FAIL":
            self._status.current_step = "VALIDATION_FAILED"
            return self._status

        # Step 8: Preview
        await _run_activity(run_preview_agent, "preview")
        if _check_abort():
            return self._status

        # Gate 2: Human preview review
        self._status.current_step = "AWAITING_PREVIEW_REVIEW"
        await workflow.wait_condition(
            lambda: self._preview_review is not None or self._abort is not None,
            timeout=timedelta(hours=48),
        )
        if _check_abort():
            return self._status
        if self._preview_review and not self._preview_review.approved:
            self._status.gate2_approved = False
            self._status.current_step = "PREVIEW_REJECTED"
            return self._status
        self._status.gate2_approved = True

        # Step 10: Finalize
        self._status.current_step = "FINALIZED"
        self._status.finalized = True
        return self._status
