"""Golden-pair standalone tests for ValidationAgent.

Run with: AGENT_LLM_STUB=true pytest tests/agents/test_validation.py -v
"""
from __future__ import annotations

import os

os.environ.setdefault("AGENT_LLM_STUB", "true")

import pytest

from agent_base.schemas import AgentConfig, AgentInput
from agents.validation.agent import ValidationAgent
from agents.validation.schemas import ValidationOutput, ViolationSeverity


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


def _audience_output() -> dict:
    return {
        "segments": [{"segment_key": "heavy_grillers_loyal", "name": "Heavy",
                      "description": "Heavy", "rule": {"logic": "AND", "conditions": [], "sub_groups": []},
                      "estimated_size": 280000, "priority": 1}],
        "total_estimated_size": 800000, "primary_audience_description": "Grilling members.",
        "suppression_rules": [], "privacy_risk_level": "LOW",
        "privacy_notes": [], "channel_size_estimates": {}, "rationale": "SW",
    }


def _creative_output() -> dict:
    return {
        "variants": [
            {"variant_key": "email_premium_grilling_v1", "channel": "EMAIL",
             "headline": "Your Best Cookout", "body_copy": "Premium cuts at loyalty prices.",
             "cta_text": "Shop Loyalty Deals", "messaging_pillar_ref": "Premium grilling",
             "audience_segment_ref": "heavy_grillers_loyal", "tone": "warm_premium"},
        ],
        "channel_variant_count": {"EMAIL": 1},
        "copy_length_compliance": {"EMAIL": True},
        "brand_voice_notes": "Warm, premium tone.",
        "rationale": "One channel, one pillar.",
    }


def _targeting_output() -> dict:
    return {
        "channel_configs": [
            {"channel": "EMAIL", "audience_segment_keys": ["heavy_grillers_loyal"],
             "bid_strategy": "CPM", "bid_amount_cents": 150, "daily_budget_cents": 68750,
             "frequency_caps": [], "geo_targets": [], "daypart_schedules": [],
             "estimated_reach": 720000, "estimated_impressions": 2160000, "estimated_cpm_cents": 150},
        ],
        "total_budget_media_cents": 37_500_000, "total_estimated_reach": 720000,
        "total_estimated_impressions": 2160000, "flight_days": 91,
        "reach_deviation_pct": 0.0, "suppression_audience_keys": ["opted_out_email"],
        "rationale": "EMAIL primary.", "risk_notes": [],
    }


def _experience_output() -> dict:
    return {
        "journey_name": "Summer Grilling Loyalty Journey",
        "journey_description": "Multi-touch journey.",
        "touchpoints": [
            {"step_number": 1, "channel": "EMAIL", "trigger": "CAMPAIGN_START",
             "delay_hours": 0, "experience_type": "EMAIL",
             "variants": [{"variant_key": "tp1_treatment", "is_control": False, "weight": 0.9,
                           "description": "Treatment", "copy_variant_key": "email_premium_grilling_v1",
                           "personalization_rules": []}],
             "audience_segment_keys": ["heavy_grillers_loyal"]},
        ],
        "total_touchpoints": 1, "channels_used": ["EMAIL"],
        "personalization_enabled": True, "control_group_pct": 0.1,
        "estimated_engagement_rate": 0.045, "rationale": "Single-step.", "risk_notes": [],
    }


def _full_upstream() -> dict:
    return {
        "strategy": _strategy_output(),
        "audience": _audience_output(),
        "creative": _creative_output(),
        "targeting": _targeting_output(),
        "experience": _experience_output(),
    }


@pytest.fixture(scope="module")
def validation_agent() -> ValidationAgent:
    return ValidationAgent()


@pytest.fixture(scope="module")
def full_campaign_input() -> AgentInput:
    return AgentInput(
        campaign_id="550e8400-e29b-41d4-a716-446655440007",
        upstream_outputs=_full_upstream(),
        config=AgentConfig(stub_mode=True),
    )


class TestValidationAgentGoldenPair:
    def test_run_returns_output(self, validation_agent, full_campaign_input):
        result = validation_agent.run(full_campaign_input)
        assert result.agent_name == "validation"

    def test_output_schema_valid(self, validation_agent, full_campaign_input):
        result = validation_agent.run(full_campaign_input)
        parsed = ValidationOutput(**result.output)
        assert parsed.completeness_score >= 0.0

    def test_overall_status_valid(self, validation_agent, full_campaign_input):
        result = validation_agent.run(full_campaign_input)
        assert result.output["overall_status"] in {"PASS", "PASS_WITH_WARNINGS", "FAIL"}

    def test_completeness_checks_populated(self, validation_agent, full_campaign_input):
        result = validation_agent.run(full_campaign_input)
        parsed = ValidationOutput(**result.output)
        assert len(parsed.completeness_checks) >= 1

    def test_brand_compliance_score_valid(self, validation_agent, full_campaign_input):
        result = validation_agent.run(full_campaign_input)
        parsed = ValidationOutput(**result.output)
        assert 0.0 <= parsed.brand_compliance_score <= 1.0

    def test_regulatory_compliance_score_valid(self, validation_agent, full_campaign_input):
        result = validation_agent.run(full_campaign_input)
        parsed = ValidationOutput(**result.output)
        assert 0.0 <= parsed.regulatory_compliance_score <= 1.0

    def test_launch_readiness_consistent_with_status(self, validation_agent, full_campaign_input):
        result = validation_agent.run(full_campaign_input)
        parsed = ValidationOutput(**result.output)
        if parsed.overall_status == "FAIL":
            assert parsed.launch_readiness is False
        else:
            assert parsed.launch_readiness is True

    def test_rationale_present(self, validation_agent, full_campaign_input):
        result = validation_agent.run(full_campaign_input)
        assert len(result.output.get("rationale", "")) > 30

    def test_run_id_unique(self, validation_agent, full_campaign_input):
        r1 = validation_agent.run(full_campaign_input)
        r2 = validation_agent.run(full_campaign_input)
        assert r1.run_id != r2.run_id


class TestValidationAgentPreChecks:
    def test_missing_strategy_raises(self, validation_agent):
        from agent_base.base import PreCheckError
        agent_input = AgentInput(
            campaign_id="x",
            upstream_outputs={
                "audience": _audience_output(),
                "creative": _creative_output(),
                "targeting": _targeting_output(),
                "experience": _experience_output(),
            },
            config=AgentConfig(stub_mode=True),
        )
        with pytest.raises(PreCheckError) as exc_info:
            validation_agent.pre_checks(agent_input)
        assert exc_info.value.check_name == "strategy_required"

    def test_too_few_agents_raises(self, validation_agent):
        from agent_base.base import PreCheckError
        agent_input = AgentInput(
            campaign_id="x",
            upstream_outputs={
                "strategy": _strategy_output(),
                "audience": _audience_output(),
                # missing creative, targeting, experience
            },
            config=AgentConfig(stub_mode=True),
        )
        with pytest.raises(PreCheckError) as exc_info:
            validation_agent.pre_checks(agent_input)
        assert exc_info.value.check_name == "minimum_agents_required"

    def test_all_required_agents_pass(self, validation_agent, full_campaign_input):
        validation_agent.pre_checks(full_campaign_input)  # must not raise

    def test_empty_strategy_raises(self, validation_agent):
        from agent_base.base import PreCheckError
        agent_input = AgentInput(
            campaign_id="x",
            upstream_outputs={
                "strategy": {},
                "audience": _audience_output(),
                "creative": _creative_output(),
                "targeting": _targeting_output(),
                "experience": _experience_output(),
            },
            config=AgentConfig(stub_mode=True),
        )
        with pytest.raises(PreCheckError) as exc_info:
            validation_agent.pre_checks(agent_input)
        assert exc_info.value.check_name == "strategy_required"


class TestValidationAgentPostProcess:
    def test_critical_violation_sets_fail_status(self, validation_agent):
        output = {
            "overall_status": "PASS",  # wrong — should be overridden
            "completeness_score": 0.8,
            "completeness_checks": [{"check_name": "c1", "agent_name": "strategy",
                                     "passed": True, "notes": ""}],
            "violations": [
                {"violation_id": "v001", "severity": "CRITICAL", "category": "BUDGET",
                 "description": "Budget overrun", "affected_agent": "targeting",
                 "remediation": "Reduce channel spend"},
            ],
            "blocking_violations": [],
            "brand_compliance_score": 0.9,
            "regulatory_compliance_score": 1.0,
            "launch_readiness": True,  # wrong — should be False
            "rationale": "test",
            "recommendations": [],
        }
        dummy = AgentInput(campaign_id="x", upstream_outputs={}, config=AgentConfig(stub_mode=True))
        result = validation_agent.post_process(output, dummy)
        assert result["overall_status"] == "FAIL"
        assert result["launch_readiness"] is False
        assert "v001" in result["blocking_violations"]

    def test_warning_only_sets_pass_with_warnings(self, validation_agent):
        output = {
            "overall_status": "PASS",  # will be corrected to PASS_WITH_WARNINGS
            "completeness_score": 0.9,
            "completeness_checks": [],
            "violations": [
                {"violation_id": "w001", "severity": "WARNING", "category": "MEASUREMENT",
                 "description": "Missing KPI coverage", "affected_agent": "measurement",
                 "remediation": "Add KPI definition"},
            ],
            "blocking_violations": [],
            "brand_compliance_score": 0.9,
            "regulatory_compliance_score": 1.0,
            "launch_readiness": False,
            "rationale": "test",
            "recommendations": [],
        }
        dummy = AgentInput(campaign_id="x", upstream_outputs={}, config=AgentConfig(stub_mode=True))
        result = validation_agent.post_process(output, dummy)
        assert result["overall_status"] == "PASS_WITH_WARNINGS"
        assert result["launch_readiness"] is True
        assert result["blocking_violations"] == []

    def test_no_violations_sets_pass(self, validation_agent):
        output = {
            "overall_status": "FAIL",  # wrong — no violations → should be PASS
            "completeness_score": 1.0,
            "completeness_checks": [{"check_name": "c1", "agent_name": "strategy",
                                     "passed": True, "notes": ""}],
            "violations": [],
            "blocking_violations": [],
            "brand_compliance_score": 1.0,
            "regulatory_compliance_score": 1.0,
            "launch_readiness": False,
            "rationale": "test",
            "recommendations": [],
        }
        dummy = AgentInput(campaign_id="x", upstream_outputs={}, config=AgentConfig(stub_mode=True))
        result = validation_agent.post_process(output, dummy)
        assert result["overall_status"] == "PASS"
        assert result["launch_readiness"] is True

    def test_completeness_score_recomputed(self, validation_agent):
        output = {
            "overall_status": "PASS",
            "completeness_score": 0.0,  # wrong — should be recomputed
            "completeness_checks": [
                {"check_name": "c1", "agent_name": "strategy", "passed": True, "notes": ""},
                {"check_name": "c2", "agent_name": "audience", "passed": True, "notes": ""},
                {"check_name": "c3", "agent_name": "creative", "passed": False, "notes": "missing"},
                {"check_name": "c4", "agent_name": "targeting", "passed": True, "notes": ""},
            ],
            "violations": [],
            "blocking_violations": [],
            "brand_compliance_score": 0.9,
            "regulatory_compliance_score": 1.0,
            "launch_readiness": True,
            "rationale": "test",
            "recommendations": [],
        }
        dummy = AgentInput(campaign_id="x", upstream_outputs={}, config=AgentConfig(stub_mode=True))
        result = validation_agent.post_process(output, dummy)
        assert abs(result["completeness_score"] - 0.75) < 0.01  # 3 of 4 passed

    def test_empty_completeness_checks_no_crash(self, validation_agent):
        output = {
            "overall_status": "PASS",
            "completeness_score": 1.0,
            "completeness_checks": [],
            "violations": [],
            "blocking_violations": [],
            "brand_compliance_score": 1.0,
            "regulatory_compliance_score": 1.0,
            "launch_readiness": True,
            "rationale": "test",
            "recommendations": [],
        }
        dummy = AgentInput(campaign_id="x", upstream_outputs={}, config=AgentConfig(stub_mode=True))
        result = validation_agent.post_process(output, dummy)
        assert result["completeness_score"] == 1.0  # unchanged when checks empty


class TestValidationAgentDefaultConfig:
    def test_uses_haiku_model(self, validation_agent):
        assert validation_agent.default_config.model == "claude-haiku-4-5-20251001"

    def test_critique_uses_opus(self, validation_agent):
        assert validation_agent.default_config.critique_model == "claude-opus-4-8"

    def test_score_threshold_high(self, validation_agent):
        assert validation_agent.default_config.score_threshold == 4.5

    def test_hard_minimum_high(self, validation_agent):
        assert validation_agent.default_config.hard_minimum_score == 4.0

    def test_max_iterations(self, validation_agent):
        assert validation_agent.default_config.max_iterations == 3

    def test_dimensions(self, validation_agent):
        expected = {"completeness", "compliance_coverage", "false_negative_risk"}
        assert set(validation_agent.dimensions) == expected
