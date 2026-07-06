"""ExperienceAgent — designs customer journeys, touchpoint sequences, and personalization.

Per architecture plan Section 3.1:
  Model: claude-sonnet-5
  Critique model: claude-haiku-4-5-20251001
  Score threshold: 3.5/5
  Hard minimum: 2.5/5
  Max iterations: 2
  Dimensions: journey_coherence, creative_coverage, personalization_logic, channel_fit

Pre-checks:
  - strategy must be present
  - creative output must be present with at least 1 variant
  - targeting output must be present with at least 1 channel config
"""
from __future__ import annotations

import json
import logging
from typing import Any

from pydantic import BaseModel

from agent_base.base import BaseAgent, PreCheckError
from agent_base.llm.client import Message
from agent_base.schemas import AgentConfig, AgentInput

from .schemas import ExperienceOutput

logger = logging.getLogger(__name__)

EXPERIENCE_SYSTEM_PROMPT = """\
You are the Experience Agent for CampaignOS, an AI-native marketing operating system.
Your role is to design a cohesive customer journey with sequenced touchpoints that convert
the campaign strategy into an engaging, personalized experience.

Guidelines:
- Design 3-7 touchpoints in logical sequence (awareness → consideration → conversion → retention).
- Each touchpoint must reference audience_segment_keys from the audience plan.
- Triggers: CAMPAIGN_START for the first touchpoint; subsequent steps use DAY_N or
  behavioral triggers (NO_OPEN_7D, PURCHASE_EVENT, SEGMENT_ENTRY).
- Each touchpoint must have at least 2 variants (treatment + control).
- control_group_pct: typically 0.10 (10% holdout for lift measurement).
- Personalization: map audience segments to specific copy variants (copy_variant_key from creative).
- estimated_engagement_rate: weighted average across channels (EMAIL ~0.03-0.08,
  PAID_SOCIAL ~0.01-0.04, SMS ~0.15-0.35, PUSH ~0.02-0.10).
- channels_used must be a subset of the channels in the strategy channel_mix.
- All variant weights within a touchpoint must sum to 1.0.

You MUST respond with ONLY a valid JSON object matching the ExperienceOutput schema.
Do not include prose, markdown, or explanations outside the JSON.

ExperienceOutput schema:
{schema}
"""


class ExperienceAgent(BaseAgent):
    @property
    def agent_name(self) -> str:
        return "experience"

    @property
    def output_schema(self) -> type[BaseModel]:
        return ExperienceOutput

    @property
    def dimensions(self) -> list[str]:
        return [
            "journey_coherence",
            "creative_coverage",
            "personalization_logic",
            "channel_fit",
        ]

    @property
    def default_config(self) -> AgentConfig:
        return AgentConfig(
            model="claude-sonnet-5",
            critique_model="claude-haiku-4-5-20251001",
            max_iterations=2,
            score_threshold=3.5,
            hard_minimum_score=2.5,
            per_run_token_budget=10_000,
        )

    def pre_checks(self, input: AgentInput) -> None:
        strategy = input.upstream_outputs.get("strategy") or {}
        creative = input.upstream_outputs.get("creative") or {}
        targeting = input.upstream_outputs.get("targeting") or {}

        if not strategy:
            raise PreCheckError(
                "Strategy output is missing — ExperienceAgent requires approved strategy",
                check_name="strategy_required",
            )

        if not creative:
            raise PreCheckError(
                "Creative output is missing — ExperienceAgent requires creative variants",
                check_name="creative_required",
            )

        if not creative.get("variants"):
            raise PreCheckError(
                "Creative has no variants — cannot reference copy in experience slots",
                check_name="creative_variants_required",
            )

        if not targeting:
            raise PreCheckError(
                "Targeting output is missing — ExperienceAgent requires channel configs",
                check_name="targeting_required",
            )

        if not targeting.get("channel_configs"):
            raise PreCheckError(
                "Targeting has no channel configs — cannot build experience touchpoints",
                check_name="targeting_configs_required",
            )

    def build_prompt(self, input: AgentInput) -> tuple[str, list[Message]]:
        schema_json = json.dumps(ExperienceOutput.model_json_schema(), indent=2)
        system = EXPERIENCE_SYSTEM_PROMPT.format(schema=schema_json)

        strategy = input.upstream_outputs.get("strategy", {})
        creative = input.upstream_outputs.get("creative", {})
        audience = input.upstream_outputs.get("audience", {})
        targeting = input.upstream_outputs.get("targeting", {})
        campaign_meta = input.upstream_outputs.get("campaign_meta", {})

        context_parts = []

        if strategy:
            channels = strategy.get("channel_mix", {}).get("channels", [])
            start = strategy.get("start_date") or campaign_meta.get("start_date", "TBD")
            end = strategy.get("end_date") or campaign_meta.get("end_date", "TBD")
            context_parts.append(
                f"Strategy:\n"
                f"  Objective: {strategy.get('objective', '')}\n"
                f"  Channels: {', '.join(channels)}\n"
                f"  Flight: {start} → {end}\n"
                f"  Messaging Pillars: {'; '.join(strategy.get('messaging_pillars', []))}"
            )

        if audience:
            segs = [s.get("segment_key", "") for s in audience.get("segments", [])]
            context_parts.append(
                f"Audience Segments: {', '.join(segs)}\n"
                f"  Total size: {audience.get('total_estimated_size', 0):,}"
            )

        if creative:
            variants_summary = "; ".join(
                f"{v.get('variant_key', '?')} ({v.get('channel', '?')})"
                for v in creative.get("variants", [])[:6]
            )
            context_parts.append(f"Creative Variants available: {variants_summary}")

        if targeting:
            ch_configs = targeting.get("channel_configs", [])
            configs_summary = "; ".join(
                f"{c.get('channel', '?')}: reach={c.get('estimated_reach', 0):,}"
                for c in ch_configs
            )
            context_parts.append(f"Targeting configs: {configs_summary}")

        user_content = (
            "Design a complete customer journey with touchpoints for the following campaign:\n\n"
            + "\n\n".join(context_parts)
            + "\n\nEnsure each touchpoint references actual creative variant keys and audience "
            "segment keys from the context above.\n"
            "Respond with ONLY the JSON experience plan."
        )

        return system, [Message(role="user", content=user_content)]

    def post_process(self, output: dict[str, Any], input: AgentInput) -> dict[str, Any]:
        """Ensure total_touchpoints matches actual touchpoints list count."""
        touchpoints = output.get("touchpoints", [])
        output["total_touchpoints"] = len(touchpoints)

        # Collect all channels used
        used_channels = list({
            tp.get("channel", "") for tp in touchpoints if tp.get("channel")
        })
        if used_channels:
            output["channels_used"] = used_channels

        return output
