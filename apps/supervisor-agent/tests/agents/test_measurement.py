"""Golden-pair standalone tests for MeasurementAgent.

Run with: AGENT_LLM_STUB=true pytest tests/agents/test_measurement.py -v
"""
from __future__ import annotations

import os

os.environ.setdefault("AGENT_LLM_STUB", "true")

import pytest

from agent_base.schemas import AgentConfig, AgentInput
from agents.measurement.agent import MeasurementAgent
from agents.measurement.schemas import MeasurementOutput


def _strategy_output() -> dict:
    return {
        "objective": "Increase basket size by 15%.",
        "channel_mix": {"channels": ["EMAIL", "PAID_SOCIAL"], "primary_channel": "EMAIL",
                        "channel_allocation": {"EMAIL": 0.55, "PAID_SOCIAL": 0.45}},
        "target_market": {"description": "Active Vons loyalty members.", "segments": [],
                          "geography": "Southwest", "age_bands": ["25-44"]},
        "messaging_pillars": ["Premium grilling at loyalty prices", "30-minute meals"],
        "kpi_targets": [{"metric_name": "basket_size_uplift_pct", "target_value": 15.0,
                         "measurement_window_days": 90, "attribution_model": "LAST_TOUCH"}],
        "budget_total_cents": 50_000_000, "budget_media_cents": 37_500_000,
        "budget_production_cents": 7_500_000, "start_date": "2026-06-01", "end_date": "2026-08-31",
        "creative_brief_summary": "Brief.", "risks": [], "rationale": "SW index 142.",
    }


def _targeting_output() -> dict:
    return {
        "channel_configs": [
            {"channel": "EMAIL", "audience_segment_keys": ["heavy_grillers_loyal"],
             "bid_strategy": "CPM", "bid_amount_cents": 150, "daily_budget_cents": 68750,
             "frequency_caps": [], "geo_targets": [], "daypart_schedules": [],
             "estimated_reach": 720000, "estimated_impressions": 2160000, "estimated_cpm_cents": 150},
            {"channel": "PAID_SOCIAL", "audience_segment_keys": ["heavy_grillers_loyal"],
             "bid_strategy": "CPM", "bid_amount_cents": 1200, "daily_budget_cents": 185000,
             "frequency_caps": [], "geo_targets": [], "daypart_schedules": [],
             "estimated_reach": 320000, "estimated_impressions": 960000, "estimated_cpm_cents": 1200},
        ],
        "total_budget_media_cents": 37_500_000,
        "total_estimated_reach": 1_040_000,
        "total_estimated_impressions": 3_120_000,
        "flight_days": 91,
        "reach_deviation_pct": 0.0,
        "suppression_audience_keys": ["opted_out_email"],
        "rationale": "Two-channel plan.",
        "risk_notes": [],
    }


def _experience_output() -> dict:
    return {
        "journey_name": "Summer Grilling Loyalty Journey",
        "journey_description": "Multi-touch journey.",
        "touchpoints": [
            {"step_number": 1, "channel": "EMAIL", "trigger": "CAMPAIGN_START",
             "delay_hours": 0, "experience_type": "EMAIL",
             "variants": [{"variant_key": "tp1_treatment", "is_control": False, "weight": 0.9,
                           "description": "Treatment", "copy_variant_key": "email_v1",
                           "personalization_rules": []}],
             "audience_segment_keys": ["heavy_grillers_loyal"]},
        ],
        "total_touchpoints": 1, "channels_used": ["EMAIL", "PAID_SOCIAL"],
        "personalization_enabled": True, "control_group_pct": 0.1,
        "estimated_engagement_rate": 0.045,
        "rationale": "Single-step journey.", "risk_notes": [],
    }


def _experiment_output() -> dict:
    return {
        "experiment_type": "AB",
        "hypothesis": "H0: no difference. H1: treatment increases basket size.",
        "variants": [
            {"variant_key": "control", "is_control": True, "allocation_pct": 50.0, "description": "Control"},
            {"variant_key": "treatment", "is_control": False, "allocation_pct": 50.0, "description": "Treatment"},
        ],
        "primary_metric": "basket_size_uplift_pct",
        "secondary_metrics": ["conversion_rate"],
        "sample_size_calculations": [
            {"metric_name": "basket_size_uplift_pct", "baseline_rate": 0.12, "mde": 0.015,
             "confidence_level": 0.95, "power": 0.8, "required_sample_size": 52000, "test_duration_days": 28}
        ],
        "test_duration_days": 28, "minimum_detectable_effect": 0.015,
        "confidence_level": 0.95, "statistical_power": 0.8,
        "rationale": "AB test over 28 days.", "risk_notes": [],
    }


@pytest.fixture(scope="module")
def measurement_agent() -> MeasurementAgent:
    return MeasurementAgent()


@pytest.fixture(scope="module")
def grilling_input() -> AgentInput:
    return AgentInput(
        campaign_id="550e8400-e29b-41d4-a716-446655440006",
        upstream_outputs={
            "strategy": _strategy_output(),
            "targeting": _targeting_output(),
            "experience": _experience_output(),
            "experiment": _experiment_output(),
        },
        config=AgentConfig(stub_mode=True),
    )


class TestMeasurementAgentGoldenPair:
    def test_run_returns_output(self, measurement_agent, grilling_input):
        result = measurement_agent.run(grilling_input)
        assert result.agent_name == "measurement"

    def test_output_schema_valid(self, measurement_agent, grilling_input):
        result = measurement_agent.run(grilling_input)
        parsed = MeasurementOutput(**result.output)
        assert len(parsed.kpi_definitions) >= 1

    def test_kpi_definitions_populated(self, measurement_agent, grilling_input):
        result = measurement_agent.run(grilling_input)
        parsed = MeasurementOutput(**result.output)
        assert len(parsed.kpi_definitions) >= 1

    def test_attribution_window_valid(self, measurement_agent, grilling_input):
        result = measurement_agent.run(grilling_input)
        parsed = MeasurementOutput(**result.output)
        assert parsed.attribution_window_days > 0

    def test_anomaly_thresholds_populated(self, measurement_agent, grilling_input):
        result = measurement_agent.run(grilling_input)
        parsed = MeasurementOutput(**result.output)
        assert len(parsed.anomaly_thresholds) >= 1

    def test_tracking_requirements_populated(self, measurement_agent, grilling_input):
        result = measurement_agent.run(grilling_input)
        parsed = MeasurementOutput(**result.output)
        assert len(parsed.tracking_requirements) >= 1

    def test_rationale_present(self, measurement_agent, grilling_input):
        result = measurement_agent.run(grilling_input)
        assert len(result.output.get("rationale", "")) > 30

    def test_lift_study_eligible_field_present(self, measurement_agent, grilling_input):
        result = measurement_agent.run(grilling_input)
        assert "lift_study_eligible" in result.output

    def test_run_id_unique(self, measurement_agent, grilling_input):
        r1 = measurement_agent.run(grilling_input)
        r2 = measurement_agent.run(grilling_input)
        assert r1.run_id != r2.run_id


class TestMeasurementAgentPreChecks:
    def test_missing_strategy_raises(self, measurement_agent):
        from agent_base.base import PreCheckError
        agent_input = AgentInput(
            campaign_id="x",
            upstream_outputs={"targeting": _targeting_output()},
            config=AgentConfig(stub_mode=True),
        )
        with pytest.raises(PreCheckError) as exc_info:
            measurement_agent.pre_checks(agent_input)
        assert exc_info.value.check_name == "strategy_required"

    def test_missing_kpi_targets_raises(self, measurement_agent):
        from agent_base.base import PreCheckError
        strategy_no_kpis = {**_strategy_output(), "kpi_targets": []}
        agent_input = AgentInput(
            campaign_id="x",
            upstream_outputs={"strategy": strategy_no_kpis, "targeting": _targeting_output()},
            config=AgentConfig(stub_mode=True),
        )
        with pytest.raises(PreCheckError) as exc_info:
            measurement_agent.pre_checks(agent_input)
        assert exc_info.value.check_name == "kpi_targets_required"

    def test_missing_targeting_raises(self, measurement_agent):
        from agent_base.base import PreCheckError
        agent_input = AgentInput(
            campaign_id="x",
            upstream_outputs={"strategy": _strategy_output()},
            config=AgentConfig(stub_mode=True),
        )
        with pytest.raises(PreCheckError) as exc_info:
            measurement_agent.pre_checks(agent_input)
        assert exc_info.value.check_name == "targeting_required"

    def test_valid_inputs_pass(self, measurement_agent, grilling_input):
        measurement_agent.pre_checks(grilling_input)  # must not raise


class TestMeasurementAgentPostProcess:
    def test_channels_without_measurement_derived(self, measurement_agent):
        output = {
            "kpi_definitions": [],
            "primary_attribution_model": "LINEAR",
            "attribution_window_days": 90,
            "anomaly_thresholds": [],
            "tracking_requirements": [
                {"channel": "EMAIL", "event_name": "email_sent",
                 "data_source": "EMAIL_EVENTS", "required": True, "notes": ""},
            ],
            "channels_without_measurement": [],
            "lift_study_eligible": True,
            "rationale": "test",
            "risk_notes": [],
        }
        input_with_two_channels = AgentInput(
            campaign_id="x",
            upstream_outputs={"targeting": _targeting_output()},
            config=AgentConfig(stub_mode=True),
        )
        result = measurement_agent.post_process(output, input_with_two_channels)
        # PAID_SOCIAL has no tracking requirement → should appear in channels_without_measurement
        assert "PAID_SOCIAL" in result["channels_without_measurement"]

    def test_channels_without_measurement_empty_when_all_covered(self, measurement_agent):
        output = {
            "kpi_definitions": [],
            "primary_attribution_model": "LINEAR",
            "attribution_window_days": 90,
            "anomaly_thresholds": [],
            "tracking_requirements": [
                {"channel": "EMAIL", "event_name": "email_sent",
                 "data_source": "EMAIL_EVENTS", "required": True, "notes": ""},
                {"channel": "PAID_SOCIAL", "event_name": "ad_impression",
                 "data_source": "PAID_MEDIA_EVENTS", "required": True, "notes": ""},
            ],
            "channels_without_measurement": [],
            "lift_study_eligible": True,
            "rationale": "test",
            "risk_notes": [],
        }
        input_with_two_channels = AgentInput(
            campaign_id="x",
            upstream_outputs={"targeting": _targeting_output()},
            config=AgentConfig(stub_mode=True),
        )
        result = measurement_agent.post_process(output, input_with_two_channels)
        assert result["channels_without_measurement"] == []

    def test_post_process_no_targeting_upstream(self, measurement_agent):
        output = {
            "kpi_definitions": [],
            "primary_attribution_model": "LINEAR",
            "attribution_window_days": 90,
            "anomaly_thresholds": [],
            "tracking_requirements": [],
            "channels_without_measurement": [],
            "lift_study_eligible": False,
            "rationale": "test",
            "risk_notes": [],
        }
        dummy = AgentInput(campaign_id="x", upstream_outputs={}, config=AgentConfig(stub_mode=True))
        result = measurement_agent.post_process(output, dummy)
        # No targeting in upstream_outputs — should not crash
        assert result["channels_without_measurement"] == []


class TestMeasurementAgentDefaultConfig:
    def test_uses_haiku_model(self, measurement_agent):
        assert measurement_agent.default_config.model == "claude-haiku-4-5-20251001"

    def test_score_threshold(self, measurement_agent):
        assert measurement_agent.default_config.score_threshold == 3.5

    def test_dimensions(self, measurement_agent):
        expected = {"kpi_coverage", "attribution_soundness", "tracking_feasibility", "anomaly_coverage"}
        assert set(measurement_agent.dimensions) == expected
