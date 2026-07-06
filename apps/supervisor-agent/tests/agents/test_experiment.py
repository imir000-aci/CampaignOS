"""Golden-pair standalone tests for ExperimentAgent (Phase 4b Step 6).

Run with: AGENT_LLM_STUB=true pytest tests/agents/test_experiment.py -v
All tests use stub mode — no Anthropic API key required.
"""
from __future__ import annotations

import logging
import os

os.environ.setdefault("AGENT_LLM_STUB", "true")

import pytest

from agent_base.base import PreCheckError
from agent_base.schemas import AgentConfig, AgentInput
from agents.experiment.agent import ExperimentAgent
from agents.experiment.schemas import ExperimentOutput


# ---------------------------------------------------------------------------
# Helper factories
# ---------------------------------------------------------------------------

def _strategy_output() -> dict:
    return {
        "objective": "Increase basket size by 15% among Southwest loyalty members.",
        "channel_mix": {
            "channels": ["EMAIL", "PAID_SOCIAL"],
            "primary_channel": "EMAIL",
            "channel_allocation": {"EMAIL": 0.55, "PAID_SOCIAL": 0.45},
        },
        "target_market": {
            "description": "Active Vons loyalty members in Southwest, 25-54.",
            "segments": ["heavy_grillers_loyal"],
            "geography": "Southwest",
            "age_bands": ["25-44"],
        },
        "messaging_pillars": [
            "Premium grilling at loyalty prices",
            "30-minute meals for busy families",
        ],
        "kpi_targets": [
            {
                "metric_name": "basket_size_uplift_pct",
                "target_value": 15.0,
                "measurement_window_days": 90,
                "attribution_model": "LAST_TOUCH",
            }
        ],
        "budget_total_cents": 50_000_000,
        "budget_media_cents": 37_500_000,
        "budget_production_cents": 7_500_000,
        "start_date": "2026-06-01",
        "end_date": "2026-08-31",
        "creative_brief_summary": "Summer grilling creative brief.",
        "risks": [],
        "rationale": "Southwest grilling index 142.",
    }


def _experience_output() -> dict:
    return {
        "journey_name": "Summer Grilling Loyalty Journey",
        "journey_description": "Multi-touch journey for Southwest loyalty members.",
        "touchpoints": [
            {
                "step_number": 1,
                "channel": "EMAIL",
                "trigger": "CAMPAIGN_START",
                "delay_hours": 0,
                "experience_type": "EMAIL",
                "variants": [
                    {
                        "variant_key": "tp1_treatment",
                        "is_control": False,
                        "weight": 0.9,
                        "description": "Premium grilling email",
                        "copy_variant_key": "email_premium_grilling_v1",
                        "personalization_rules": [],
                    },
                    {
                        "variant_key": "tp1_control",
                        "is_control": True,
                        "weight": 0.1,
                        "description": "Control holdout",
                        "copy_variant_key": None,
                        "personalization_rules": [],
                    },
                ],
                "audience_segment_keys": ["heavy_grillers_loyal"],
            }
        ],
        "total_touchpoints": 1,
        "channels_used": ["EMAIL"],
        "personalization_enabled": True,
        "control_group_pct": 0.1,
        "estimated_engagement_rate": 0.045,
        "rationale": "Single-touch email journey for launch.",
        "risk_notes": [],
    }


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------

@pytest.fixture(scope="module")
def experiment_agent() -> ExperimentAgent:
    return ExperimentAgent()


@pytest.fixture(scope="module")
def grilling_input() -> AgentInput:
    return AgentInput(
        campaign_id="550e8400-e29b-41d4-a716-446655440006",
        upstream_outputs={
            "strategy": _strategy_output(),
            "experience": _experience_output(),
            "audience": {
                "segments": [
                    {
                        "segment_key": "heavy_grillers_loyal",
                        "name": "Heavy Grillers",
                        "description": "High LTV loyalty members",
                        "rule": {"logic": "AND", "conditions": [], "sub_groups": []},
                        "estimated_size": 280000,
                        "priority": 1,
                    }
                ],
                "total_estimated_size": 800000,
                "primary_audience_description": "Grilling loyalty members.",
                "suppression_rules": [],
                "privacy_risk_level": "LOW",
                "privacy_notes": [],
                "channel_size_estimates": {},
                "rationale": "SW grilling index",
            },
        },
        config=AgentConfig(stub_mode=True),
    )


# ---------------------------------------------------------------------------
# Golden-pair tests
# ---------------------------------------------------------------------------

class TestExperimentAgentGoldenPair:
    def test_run_returns_output(self, experiment_agent, grilling_input):
        result = experiment_agent.run(grilling_input)
        assert result.agent_name == "experiment"
        assert result.campaign_id == grilling_input.campaign_id

    def test_output_schema_valid(self, experiment_agent, grilling_input):
        result = experiment_agent.run(grilling_input)
        parsed = ExperimentOutput(**result.output)
        assert parsed.experiment_type is not None

    def test_has_at_least_two_variants(self, experiment_agent, grilling_input):
        result = experiment_agent.run(grilling_input)
        parsed = ExperimentOutput(**result.output)
        assert len(parsed.variants) >= 2

    def test_allocations_sum_to_100(self, experiment_agent, grilling_input):
        result = experiment_agent.run(grilling_input)
        parsed = ExperimentOutput(**result.output)
        total = sum(v.allocation_pct for v in parsed.variants)
        assert abs(total - 100.0) < 0.01

    def test_exactly_one_control_variant(self, experiment_agent, grilling_input):
        result = experiment_agent.run(grilling_input)
        parsed = ExperimentOutput(**result.output)
        control_count = sum(1 for v in parsed.variants if v.is_control)
        assert control_count == 1

    def test_primary_metric_present(self, experiment_agent, grilling_input):
        result = experiment_agent.run(grilling_input)
        parsed = ExperimentOutput(**result.output)
        assert parsed.primary_metric == "basket_size_uplift_pct"

    def test_sample_size_calc_present(self, experiment_agent, grilling_input):
        result = experiment_agent.run(grilling_input)
        parsed = ExperimentOutput(**result.output)
        assert len(parsed.sample_size_calculations) >= 1

    def test_test_duration_positive(self, experiment_agent, grilling_input):
        result = experiment_agent.run(grilling_input)
        parsed = ExperimentOutput(**result.output)
        assert parsed.test_duration_days > 0

    def test_confidence_level_in_range(self, experiment_agent, grilling_input):
        result = experiment_agent.run(grilling_input)
        parsed = ExperimentOutput(**result.output)
        assert 0.8 <= parsed.confidence_level <= 0.99

    def test_statistical_power_in_range(self, experiment_agent, grilling_input):
        result = experiment_agent.run(grilling_input)
        parsed = ExperimentOutput(**result.output)
        assert 0.7 <= parsed.statistical_power <= 0.99

    def test_hypothesis_present(self, experiment_agent, grilling_input):
        result = experiment_agent.run(grilling_input)
        assert len(result.output.get("hypothesis", "")) > 30

    def test_rationale_present(self, experiment_agent, grilling_input):
        result = experiment_agent.run(grilling_input)
        assert len(result.output.get("rationale", "")) > 30

    def test_run_id_unique(self, experiment_agent, grilling_input):
        r1 = experiment_agent.run(grilling_input)
        r2 = experiment_agent.run(grilling_input)
        assert r1.run_id != r2.run_id


# ---------------------------------------------------------------------------
# Pre-check tests
# ---------------------------------------------------------------------------

class TestExperimentAgentPreChecks:
    def test_missing_strategy_raises(self, experiment_agent):
        agent_input = AgentInput(
            campaign_id="no-strategy",
            upstream_outputs={"experience": _experience_output()},
            config=AgentConfig(stub_mode=True),
        )
        with pytest.raises(PreCheckError) as exc_info:
            experiment_agent.pre_checks(agent_input)
        assert exc_info.value.check_name == "strategy_required"

    def test_missing_experience_raises(self, experiment_agent):
        agent_input = AgentInput(
            campaign_id="no-experience",
            upstream_outputs={"strategy": _strategy_output()},
            config=AgentConfig(stub_mode=True),
        )
        with pytest.raises(PreCheckError) as exc_info:
            experiment_agent.pre_checks(agent_input)
        assert exc_info.value.check_name == "experience_required"

    def test_missing_kpis_raises(self, experiment_agent):
        strategy = {**_strategy_output(), "kpi_targets": []}
        agent_input = AgentInput(
            campaign_id="no-kpis",
            upstream_outputs={
                "strategy": strategy,
                "experience": _experience_output(),
            },
            config=AgentConfig(stub_mode=True),
        )
        with pytest.raises(PreCheckError) as exc_info:
            experiment_agent.pre_checks(agent_input)
        assert exc_info.value.check_name == "kpi_targets_required"

    def test_null_kpis_raises(self, experiment_agent):
        """kpi_targets=None should also raise kpi_targets_required."""
        strategy = {**_strategy_output(), "kpi_targets": None}
        agent_input = AgentInput(
            campaign_id="null-kpis",
            upstream_outputs={
                "strategy": strategy,
                "experience": _experience_output(),
            },
            config=AgentConfig(stub_mode=True),
        )
        with pytest.raises(PreCheckError) as exc_info:
            experiment_agent.pre_checks(agent_input)
        assert exc_info.value.check_name == "kpi_targets_required"

    def test_empty_strategy_dict_raises(self, experiment_agent):
        agent_input = AgentInput(
            campaign_id="empty-strategy",
            upstream_outputs={
                "strategy": {},
                "experience": _experience_output(),
            },
            config=AgentConfig(stub_mode=True),
        )
        with pytest.raises(PreCheckError) as exc_info:
            experiment_agent.pre_checks(agent_input)
        assert exc_info.value.check_name == "strategy_required"

    def test_valid_inputs_pass(self, experiment_agent, grilling_input):
        # Must not raise
        experiment_agent.pre_checks(grilling_input)


# ---------------------------------------------------------------------------
# Post-process tests
# ---------------------------------------------------------------------------

class TestExperimentAgentPostProcess:
    def _post(self, experiment_agent, output: dict) -> dict:
        dummy = AgentInput(campaign_id="x", upstream_outputs={}, config=AgentConfig(stub_mode=True))
        return experiment_agent.post_process(output, dummy)

    def test_control_set_if_no_control_variant(self, experiment_agent):
        output = {
            "variants": [
                {"variant_key": "v1", "is_control": False, "allocation_pct": 50.0, "description": "T1"},
                {"variant_key": "v2", "is_control": False, "allocation_pct": 50.0, "description": "T2"},
            ],
            "test_duration_days": 28,
        }
        result = self._post(experiment_agent, output)
        # First variant should now be control
        assert result["variants"][0]["is_control"] is True

    def test_existing_control_not_changed(self, experiment_agent):
        output = {
            "variants": [
                {"variant_key": "v1", "is_control": False, "allocation_pct": 50.0, "description": "T1"},
                {"variant_key": "v2", "is_control": True, "allocation_pct": 50.0, "description": "Control"},
            ],
            "test_duration_days": 28,
        }
        result = self._post(experiment_agent, output)
        # First variant stays non-control
        assert result["variants"][0]["is_control"] is False
        assert result["variants"][1]["is_control"] is True

    def test_short_duration_warning_logged(self, experiment_agent, caplog):
        output = {
            "variants": [
                {"variant_key": "v1", "is_control": True, "allocation_pct": 50.0, "description": "Control"},
                {"variant_key": "v2", "is_control": False, "allocation_pct": 50.0, "description": "T"},
            ],
            "test_duration_days": 3,
        }
        with caplog.at_level(logging.WARNING, logger="agents.experiment.agent"):
            self._post(experiment_agent, output)
        assert any("test_duration_days" in record.message for record in caplog.records)

    def test_no_warning_for_adequate_duration(self, experiment_agent, caplog):
        output = {
            "variants": [
                {"variant_key": "v1", "is_control": True, "allocation_pct": 50.0, "description": "Control"},
                {"variant_key": "v2", "is_control": False, "allocation_pct": 50.0, "description": "T"},
            ],
            "test_duration_days": 28,
        }
        with caplog.at_level(logging.WARNING, logger="agents.experiment.agent"):
            self._post(experiment_agent, output)
        duration_warnings = [
            r for r in caplog.records if "test_duration_days" in r.message
        ]
        assert len(duration_warnings) == 0

    def test_post_process_returns_output_dict(self, experiment_agent):
        output = {
            "variants": [
                {"variant_key": "v1", "is_control": True, "allocation_pct": 100.0, "description": "Control"},
            ],
            "test_duration_days": 14,
            "primary_metric": "conversion_rate",
        }
        result = self._post(experiment_agent, output)
        assert isinstance(result, dict)
        assert result["primary_metric"] == "conversion_rate"

    def test_empty_variants_no_crash(self, experiment_agent):
        output = {"variants": [], "test_duration_days": 14}
        result = self._post(experiment_agent, output)
        assert result["variants"] == []


# ---------------------------------------------------------------------------
# Default config tests
# ---------------------------------------------------------------------------

class TestExperimentAgentDefaultConfig:
    def test_model_is_haiku(self, experiment_agent):
        assert experiment_agent.default_config.model == "claude-haiku-4-5-20251001"

    def test_critique_model_is_haiku(self, experiment_agent):
        assert experiment_agent.default_config.critique_model == "claude-haiku-4-5-20251001"

    def test_score_threshold(self, experiment_agent):
        assert experiment_agent.default_config.score_threshold == 4.0

    def test_hard_minimum(self, experiment_agent):
        assert experiment_agent.default_config.hard_minimum_score == 3.0

    def test_max_iterations(self, experiment_agent):
        assert experiment_agent.default_config.max_iterations == 2

    def test_token_budget(self, experiment_agent):
        assert experiment_agent.default_config.per_run_token_budget == 10_000

    def test_dimensions(self, experiment_agent):
        expected = {
            "statistical_validity",
            "feasibility",
            "hypothesis_clarity",
            "metric_appropriateness",
        }
        assert set(experiment_agent.dimensions) == expected

    def test_agent_name(self, experiment_agent):
        assert experiment_agent.agent_name == "experiment"
