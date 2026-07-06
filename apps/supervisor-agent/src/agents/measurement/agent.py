"""MeasurementAgent — defines KPI taxonomy, attribution model, and tracking requirements.

Per architecture plan Section 3.1:
  Model: claude-haiku-4-5-20251001
  Critique model: claude-haiku-4-5-20251001
  Score threshold: 3.5/5
  Hard minimum: 2.5/5
  Max iterations: 2
  Dimensions: kpi_coverage, attribution_soundness, tracking_feasibility, anomaly_coverage

Pre-checks:
  - strategy must be present with at least 1 KPI target
  - targeting must be present (need channel list for tracking requirements)
"""
from __future__ import annotations

import json
import logging
from typing import Any

from pydantic import BaseModel

from agent_base.base import BaseAgent, PreCheckError
from agent_base.llm.client import Message
from agent_base.schemas import AgentConfig, AgentInput

from .schemas import MeasurementOutput

logger = logging.getLogger(__name__)

MEASUREMENT_SYSTEM_PROMPT = """\
You are the Measurement Agent for CampaignOS, an AI-native marketing operating system.
Your role is to define a complete measurement plan: KPI definitions, attribution model,
anomaly detection thresholds, and per-channel tracking requirements.

Guidelines:
- Define a KpiDefinition for every KPI in strategy.kpi_targets (name must match exactly).
- Select the most appropriate attribution_model for each KPI:
    * basket_size / revenue KPIs → LAST_TOUCH or LINEAR
    * brand awareness → FIRST_TOUCH
    * multi-touch journeys → TIME_DECAY or LINEAR
- attribution_window_days should span the campaign flight; default 30 days if unclear.
- anomaly_thresholds: define at least 1 CRITICAL threshold for the primary KPI.
  Lower bound: 50% of expected → CRITICAL. Lower bound: 70% → WARNING.
- tracking_requirements: one entry per channel × event_type pair.
  Required events: impressions, clicks, conversions; optional: opens (EMAIL), views (PAID_SOCIAL).
- lift_study_eligible: true if there is a holdout control group (control_group_pct > 0).
- channels_without_measurement: channels in targeting with no tracking events defined.
- risk_notes: identify KPIs at risk of under-measurement or attribution conflict.

You MUST respond with ONLY a valid JSON object matching the MeasurementOutput schema.
Do not include prose, markdown, or explanations outside the JSON.

MeasurementOutput schema:
{schema}
"""


class MeasurementAgent(BaseAgent):
    @property
    def agent_name(self) -> str:
        return "measurement"

    @property
    def output_schema(self) -> type[BaseModel]:
        return MeasurementOutput

    @property
    def dimensions(self) -> list[str]:
        return [
            "kpi_coverage",
            "attribution_soundness",
            "tracking_feasibility",
            "anomaly_coverage",
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
        targeting = input.upstream_outputs.get("targeting") or {}

        if not strategy:
            raise PreCheckError(
                "Strategy output is missing — MeasurementAgent requires approved strategy",
                check_name="strategy_required",
            )

        kpi_targets = strategy.get("kpi_targets") or []
        if not kpi_targets:
            raise PreCheckError(
                "Strategy has no KPI targets — MeasurementAgent requires at least 1 KPI",
                check_name="kpi_targets_required",
            )

        if not targeting:
            raise PreCheckError(
                "Targeting output is missing — MeasurementAgent requires channel configs",
                check_name="targeting_required",
            )

    def build_prompt(self, input: AgentInput) -> tuple[str, list[Message]]:
        schema_json = json.dumps(MeasurementOutput.model_json_schema(), indent=2)
        system = MEASUREMENT_SYSTEM_PROMPT.format(schema=schema_json)

        strategy = input.upstream_outputs.get("strategy", {})
        targeting = input.upstream_outputs.get("targeting", {})
        experience = input.upstream_outputs.get("experience", {})
        experiment = input.upstream_outputs.get("experiment", {})

        context_parts = []

        if strategy:
            kpis = strategy.get("kpi_targets", [])
            kpi_summary = "; ".join(
                f"{k.get('metric_name', '')} target={k.get('target_value', '')} "
                f"window={k.get('measurement_window_days', 30)}d "
                f"attr={k.get('attribution_model', 'LAST_TOUCH')}"
                for k in kpis
            )
            context_parts.append(
                f"Strategy:\n"
                f"  Objective: {strategy.get('objective', '')}\n"
                f"  Channels: {', '.join(strategy.get('channel_mix', {}).get('channels', []))}\n"
                f"  Flight: {strategy.get('start_date', 'TBD')} → {strategy.get('end_date', 'TBD')}\n"
                f"  KPI Targets: {kpi_summary}"
            )

        if targeting:
            ch_configs = targeting.get("channel_configs", [])
            channels = [c.get("channel", "") for c in ch_configs]
            context_parts.append(
                f"Targeting Channels: {', '.join(channels)}\n"
                f"  Flight days: {targeting.get('flight_days', 90)}"
            )

        if experience:
            control_pct = experience.get("control_group_pct", 0)
            context_parts.append(
                f"Experience:\n"
                f"  Control group: {control_pct * 100:.0f}%\n"
                f"  Channels used: {', '.join(experience.get('channels_used', []))}"
            )

        if experiment:
            context_parts.append(
                f"Experiment:\n"
                f"  Primary metric: {experiment.get('primary_metric', '')}\n"
                f"  Type: {experiment.get('experiment_type', '')}\n"
                f"  Duration: {experiment.get('test_duration_days', 0)} days"
            )

        user_content = (
            "Design a complete measurement plan for the following campaign.\n"
            "Every KPI in the strategy must have a KpiDefinition and anomaly threshold.\n\n"
            + "\n\n".join(context_parts)
            + "\n\nRespond with ONLY the JSON measurement plan."
        )

        return system, [Message(role="user", content=user_content)]

    def post_process(self, output: dict[str, Any], input: AgentInput) -> dict[str, Any]:
        """Derive channels_without_measurement from targeting vs tracking requirements."""
        targeting = input.upstream_outputs.get("targeting", {})
        ch_configs = targeting.get("channel_configs", [])
        strategy_channels = {c.get("channel", "") for c in ch_configs if c.get("channel")}

        tracked_channels = {
            req.get("channel", "") if isinstance(req, dict) else req.channel
            for req in output.get("tracking_requirements", [])
        }

        missing = sorted(strategy_channels - tracked_channels)
        if missing:
            existing = output.get("channels_without_measurement", [])
            output["channels_without_measurement"] = sorted(
                set(existing) | set(missing)
            )

        return output
