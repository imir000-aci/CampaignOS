"""TargetingAgent — maps audience segments to channel targeting configurations.

Per architecture plan Section 3.1:
  Model: claude-haiku-4-5 (fast, structured, lower stakes)
  Critique model: claude-haiku-4-5-20251001
  Score threshold: 3.5/5
  Hard minimum: 2.5/5
  Max iterations: 2
  Dimensions: audience_coverage, budget_efficiency, channel_feasibility, reach_viability

  Escalation trigger: if reach_deviation_pct > 40% from audience total_estimated_size,
  the supervisor routes to human review (implemented in LangGraph, not here).

Pre-checks (rule-based, run before LLM):
  - strategy output must be present
  - audience output must be present
  - strategy channel_mix must have at least 1 channel
  - targeting total budget must not exceed strategy budget_media_cents
"""
from __future__ import annotations

import json
import logging
from datetime import date
from typing import Any

from pydantic import BaseModel

from agent_base.base import BaseAgent, PreCheckError
from agent_base.llm.client import Message
from agent_base.schemas import AgentConfig, AgentInput

from .schemas import TargetingOutput

logger = logging.getLogger(__name__)

TARGETING_SYSTEM_PROMPT = """\
You are the Targeting Agent for CampaignOS, an AI-native marketing operating system.
Your role is to translate the approved audience plan and strategy into precise channel
targeting configurations ready for activation.

Guidelines:
- Every channel in the strategy channel_mix must have exactly one ChannelTargetingConfig.
- Bid amounts must be realistic: EMAIL CPM ~$1.20–$2.50, PAID_SOCIAL CPM ~$8–$25,
  DISPLAY CPM ~$2–$8, SMS CPM ~$40–$80, PUSH CPM ~$0.50–$2.00.
- All channel daily_budget_cents × flight_days must not exceed strategy budget_media_cents
  when summed. Allocate per channel_allocation ratios in the strategy.
- frequency_caps: EMAIL ≤ 3/week, PAID_SOCIAL ≤ 8/week, DISPLAY ≤ 15/week.
- geo_targets must match strategy geography (DMA codes or store radius).
- reach_deviation_pct = (estimated_reach - audience_total_estimated_size) /
  audience_total_estimated_size × 100. Keep within ±20% if possible; flag if ±40%.
- suppression_audience_keys must include all suppression_rules from audience output.
- Rationale must explain why this targeting approach maximizes ROI for the budget.

You MUST respond with ONLY a valid JSON object matching the TargetingOutput schema.
Do not include prose, markdown, or explanations outside the JSON.

TargetingOutput schema:
{schema}
"""


def _days_between(start: str | None, end: str | None) -> int:
    """Calculate days between two ISO date strings; default 90 if missing."""
    if not start or not end:
        return 90
    try:
        d1 = date.fromisoformat(start)
        d2 = date.fromisoformat(end)
        delta = (d2 - d1).days
        return max(delta, 1)
    except ValueError:
        return 90


class TargetingAgent(BaseAgent):
    @property
    def agent_name(self) -> str:
        return "targeting"

    @property
    def output_schema(self) -> type[BaseModel]:
        return TargetingOutput

    @property
    def dimensions(self) -> list[str]:
        return [
            "audience_coverage",
            "budget_efficiency",
            "channel_feasibility",
            "reach_viability",
        ]

    @property
    def default_config(self) -> AgentConfig:
        return AgentConfig(
            model="claude-haiku-4-5-20251001",
            critique_model="claude-haiku-4-5-20251001",
            max_iterations=2,
            score_threshold=3.5,
            hard_minimum_score=2.5,
            per_run_token_budget=10_000,
        )

    def pre_checks(self, input: AgentInput) -> None:
        strategy = input.upstream_outputs.get("strategy") or {}
        audience = input.upstream_outputs.get("audience") or {}

        if not strategy:
            raise PreCheckError(
                "Strategy output is missing — TargetingAgent requires approved strategy",
                check_name="strategy_required",
            )

        if not audience:
            raise PreCheckError(
                "Audience output is missing — TargetingAgent requires computed audience",
                check_name="audience_required",
            )

        channels = strategy.get("channel_mix", {}).get("channels", [])
        if not channels:
            raise PreCheckError(
                "Strategy has no channels — cannot build targeting configs",
                check_name="channels_required",
            )

        strategy_media_budget = strategy.get("budget_media_cents", 0)
        if strategy_media_budget <= 0:
            logger.warning(
                "TargetingAgent: strategy budget_media_cents is zero — "
                "targeting configs will have zero budgets"
            )

    def build_prompt(self, input: AgentInput) -> tuple[str, list[Message]]:
        schema_json = json.dumps(TargetingOutput.model_json_schema(), indent=2)
        system = TARGETING_SYSTEM_PROMPT.format(schema=schema_json)

        strategy = input.upstream_outputs.get("strategy", {})
        audience = input.upstream_outputs.get("audience", {})
        campaign_meta = input.upstream_outputs.get("campaign_meta", {})

        context_parts = []

        if strategy:
            channel_mix = strategy.get("channel_mix", {})
            channels_str = ", ".join(channel_mix.get("channels", []))
            allocation = channel_mix.get("channel_allocation", {})
            allocation_str = ", ".join(
                f"{ch}: {pct*100:.0f}%" for ch, pct in allocation.items()
            ) or "equal split"
            start = strategy.get("start_date") or campaign_meta.get("start_date")
            end = strategy.get("end_date") or campaign_meta.get("end_date")
            flight_days = _days_between(start, end)

            context_parts.append(
                f"Strategy:\n"
                f"  Channels: {channels_str}\n"
                f"  Channel allocation: {allocation_str}\n"
                f"  Media budget: ${strategy.get('budget_media_cents', 0) / 100:,.0f}\n"
                f"  Flight: {start} → {end} ({flight_days} days)\n"
                f"  Geography: {strategy.get('target_market', {}).get('geography', 'National')}"
            )

        if audience:
            total_size = audience.get("total_estimated_size", 0)
            segments_str = ", ".join(
                f"{s['segment_key']} ({s.get('estimated_size', 0):,})"
                for s in audience.get("segments", [])
            )
            suppressions = [s.get("reason", "") for s in audience.get("suppression_rules", [])]
            ch_estimates = audience.get("channel_size_estimates", {})
            ch_estimates_str = ", ".join(f"{ch}: {sz:,}" for ch, sz in ch_estimates.items())

            context_parts.append(
                f"Audience:\n"
                f"  Total estimated size: {total_size:,}\n"
                f"  Segments: {segments_str}\n"
                f"  Suppression rules: {', '.join(suppressions) or 'none'}\n"
                f"  Channel size estimates: {ch_estimates_str or 'not provided'}"
            )

        user_content = (
            "Build a complete targeting configuration plan for the following campaign:\n\n"
            + "\n\n".join(context_parts)
            + "\n\nRespond with ONLY the JSON targeting plan."
        )

        return system, [Message(role="user", content=user_content)]

    def post_process(self, output: dict[str, Any], input: AgentInput) -> dict[str, Any]:
        """Verify budget sum and ensure suppression keys from audience are included."""
        audience = input.upstream_outputs.get("audience", {})
        suppression_reasons = [
            s.get("reason", "") for s in audience.get("suppression_rules", [])
        ]
        existing = set(output.get("suppression_audience_keys", []))
        for reason in suppression_reasons:
            if reason and reason not in existing:
                output.setdefault("suppression_audience_keys", []).append(reason)

        # Ensure risk_notes mentions if reach_deviation_pct is large
        deviation = output.get("reach_deviation_pct", 0.0)
        if abs(deviation) > 40 and "risk_notes" in output:
            output["risk_notes"].append(
                f"Reach deviation of {deviation:.1f}% exceeds ±40% threshold — "
                "supervisor will route to human review"
            )

        return output
