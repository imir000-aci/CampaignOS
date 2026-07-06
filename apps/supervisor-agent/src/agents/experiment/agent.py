"""ExperimentAgent — designs statistically rigorous A/B and multivariate experiments.

Per architecture plan Phase 4b Step 6:
  Model: claude-haiku-4-5-20251001
  Critique model: claude-haiku-4-5-20251001
  Score threshold: 4.0/5
  Hard minimum: 3.0/5
  Max iterations: 2
  Dimensions: statistical_validity, feasibility, hypothesis_clarity, metric_appropriateness

Pre-checks:
  - strategy must be present
  - experience must be present
  - strategy must have at least 1 KPI target
"""
from __future__ import annotations

import json
import logging
from typing import Any

from pydantic import BaseModel

from agent_base.base import BaseAgent, PreCheckError
from agent_base.llm.client import Message
from agent_base.schemas import AgentConfig, AgentInput

from .schemas import ExperimentOutput

logger = logging.getLogger(__name__)

EXPERIMENT_SYSTEM_PROMPT = """\
You are the Experiment Agent for CampaignOS, an AI-native marketing operating system.
Your role is to design a statistically rigorous experiment that measures the causal impact
of campaign interventions on key performance indicators.

Guidelines:
- Design the experiment around the primary KPI defined in the campaign strategy.
- Ensure variant allocation percentages sum to exactly 100.0.
- Include exactly 1 control variant (is_control=true).
- Calculate sample sizes using standard power analysis (typically 80% power, 95% confidence).
- Test duration should be long enough to collect required sample sizes.
- Minimum detectable effect should be practically meaningful (not just statistically detectable).
- hypothesis must clearly state both H0 (null) and H1 (alternative).
- Reference experience variants and audience segments from upstream outputs.
- For AB tests: use 2 variants (control + treatment), each 50% allocation unless asymmetric testing.
- confidence_level must be between 0.80 and 0.99.
- statistical_power must be between 0.70 and 0.99.

You MUST respond with ONLY a valid JSON object matching the ExperimentOutput schema.
Do not include prose, markdown, or explanations outside the JSON.

ExperimentOutput schema:
{schema}
"""


class ExperimentAgent(BaseAgent):
    @property
    def agent_name(self) -> str:
        return "experiment"

    @property
    def output_schema(self) -> type[BaseModel]:
        return ExperimentOutput

    @property
    def dimensions(self) -> list[str]:
        return [
            "statistical_validity",
            "feasibility",
            "hypothesis_clarity",
            "metric_appropriateness",
        ]

    @property
    def default_config(self) -> AgentConfig:
        return AgentConfig(
            model="claude-haiku-4-5-20251001",
            critique_model="claude-haiku-4-5-20251001",
            max_iterations=2,
            score_threshold=4.0,
            hard_minimum_score=3.0,
            per_run_token_budget=10_000,
        )

    def pre_checks(self, input: AgentInput) -> None:
        strategy = input.upstream_outputs.get("strategy") or {}
        experience = input.upstream_outputs.get("experience") or {}

        if not strategy:
            raise PreCheckError(
                "Strategy output is missing — ExperimentAgent requires approved strategy",
                check_name="strategy_required",
            )

        if not experience:
            raise PreCheckError(
                "Experience output is missing — ExperimentAgent requires experience plan",
                check_name="experience_required",
            )

        kpi_targets = strategy.get("kpi_targets") or []
        if not kpi_targets:
            raise PreCheckError(
                "Strategy has no KPI targets — ExperimentAgent requires at least 1 KPI to measure",
                check_name="kpi_targets_required",
            )

    def build_prompt(self, input: AgentInput) -> tuple[str, list[Message]]:
        schema_json = json.dumps(ExperimentOutput.model_json_schema(), indent=2)
        system = EXPERIMENT_SYSTEM_PROMPT.format(schema=schema_json)

        strategy = input.upstream_outputs.get("strategy", {})
        experience = input.upstream_outputs.get("experience", {})
        audience = input.upstream_outputs.get("audience", {})

        context_parts = []

        if strategy:
            kpis = strategy.get("kpi_targets", [])
            primary_kpi = kpis[0].get("metric_name", "") if kpis else ""
            kpi_summary = "; ".join(
                f"{k.get('metric_name', '')} target={k.get('target_value', '')} "
                f"({k.get('measurement_window_days', 30)}d)"
                for k in kpis[:3]
            )
            context_parts.append(
                f"Strategy:\n"
                f"  Objective: {strategy.get('objective', '')}\n"
                f"  Primary KPI: {primary_kpi}\n"
                f"  KPI Targets: {kpi_summary}\n"
                f"  Channels: {', '.join(strategy.get('channel_mix', {}).get('channels', []))}"
            )

        if experience:
            touchpoints = experience.get("touchpoints", [])
            tp_summary = "; ".join(
                f"step{tp.get('step_number', '?')} ({tp.get('channel', '?')})"
                for tp in touchpoints[:5]
            )
            variants_summary = "; ".join(
                f"{v.get('variant_key', '?')} (control={v.get('is_control', False)})"
                for tp in touchpoints[:3]
                for v in tp.get("variants", [])[:2]
            )
            context_parts.append(
                f"Experience Plan:\n"
                f"  Journey: {experience.get('journey_name', 'Unnamed')}\n"
                f"  Touchpoints: {tp_summary}\n"
                f"  Variants: {variants_summary}\n"
                f"  Control Group: {experience.get('control_group_pct', 0.1) * 100:.0f}%"
            )

        if audience:
            segs = [s.get("segment_key", "") for s in audience.get("segments", [])]
            context_parts.append(
                f"Audience Segments: {', '.join(segs)}\n"
                f"  Total size: {audience.get('total_estimated_size', 0):,}"
            )

        user_content = (
            "Design a complete experiment plan for the following campaign.\n"
            "The experiment must measure the primary KPI from the strategy.\n\n"
            + "\n\n".join(context_parts)
            + "\n\nEnsure variants reference the experience touchpoints above. "
            "Respond with ONLY the JSON experiment plan."
        )

        return system, [Message(role="user", content=user_content)]

    def post_process(self, output: dict[str, Any], input: AgentInput) -> dict[str, Any]:
        """Ensure exactly 1 control variant and warn on short test durations."""
        variants = output.get("variants", [])

        # Ensure exactly 1 control variant — set first if none found
        has_control = any(v.get("is_control", False) for v in variants)
        if not has_control and variants:
            logger.warning(
                "%s: no control variant found in output — setting first variant as control",
                self.agent_name,
            )
            variants[0]["is_control"] = True

        # Warn on short test durations (< 7 days)
        test_duration = output.get("test_duration_days", 0)
        if test_duration < 7:
            logger.warning(
                "%s: test_duration_days=%d is less than 7 — may be insufficient for valid results",
                self.agent_name,
                test_duration,
            )

        return output
