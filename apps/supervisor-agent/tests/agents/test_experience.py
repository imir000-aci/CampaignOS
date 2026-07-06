"""Golden-pair standalone tests for ExperienceAgent.

Run with: AGENT_LLM_STUB=true pytest tests/agents/test_experience.py -v
"""
from __future__ import annotations

import os

os.environ.setdefault("AGENT_LLM_STUB", "true")

import pytest

from agent_base.schemas import AgentConfig, AgentInput
from agents.experience.agent import ExperienceAgent
from agents.experience.schemas import ExperienceOutput


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


def _creative_output() -> dict:
    return {
        "variants": [
            {"variant_key": "email_premium_grilling_v1", "channel": "EMAIL",
             "headline": "Your Best Cookout", "body_copy": "Premium cuts at loyalty prices.",
             "cta_text": "Shop Loyalty Deals", "messaging_pillar_ref": "Premium grilling",
             "audience_segment_ref": "heavy_grillers_loyal", "tone": "warm_premium"},
            {"variant_key": "paid_social_loyalty_v1", "channel": "PAID_SOCIAL",
             "headline": "Cookout Perks Ready", "body_copy": "Exclusive savings on grilling.",
             "cta_text": "Claim Savings", "messaging_pillar_ref": "Premium grilling",
             "audience_segment_ref": None, "tone": "urgent_warm"},
        ],
        "channel_variant_count": {"EMAIL": 1, "PAID_SOCIAL": 1},
        "copy_length_compliance": {"EMAIL": True, "PAID_SOCIAL": True},
        "brand_voice_notes": "Warm, premium tone.",
        "rationale": "Two channels, two pillars.",
    }


def _targeting_output() -> dict:
    return {
        "channel_configs": [
            {"channel": "EMAIL", "audience_segment_keys": ["heavy_grillers_loyal"],
             "bid_strategy": "CPM", "bid_amount_cents": 150, "daily_budget_cents": 68750,
             "frequency_caps": [], "geo_targets": [], "daypart_schedules": [],
             "estimated_reach": 720000, "estimated_impressions": 2160000, "estimated_cpm_cents": 150},
        ],
        "total_budget_media_cents": 37_500_000,
        "total_estimated_reach": 720000,
        "total_estimated_impressions": 2160000,
        "flight_days": 91,
        "reach_deviation_pct": 0.0,
        "suppression_audience_keys": ["opted_out_email"],
        "rationale": "EMAIL primary channel.",
        "risk_notes": [],
    }


@pytest.fixture(scope="module")
def experience_agent() -> ExperienceAgent:
    return ExperienceAgent()


@pytest.fixture(scope="module")
def grilling_input() -> AgentInput:
    return AgentInput(
        campaign_id="550e8400-e29b-41d4-a716-446655440005",
        upstream_outputs={
            "strategy": _strategy_output(),
            "creative": _creative_output(),
            "audience": {"segments": [{"segment_key": "heavy_grillers_loyal", "name": "Heavy",
                                       "description": "Heavy", "rule": {"logic": "AND", "conditions": [], "sub_groups": []},
                                       "estimated_size": 280000, "priority": 1}],
                         "total_estimated_size": 800000, "primary_audience_description": "Grilling members.",
                         "suppression_rules": [], "privacy_risk_level": "LOW",
                         "privacy_notes": [], "channel_size_estimates": {}, "rationale": "SW"},
            "targeting": _targeting_output(),
        },
        config=AgentConfig(stub_mode=True),
    )


class TestExperienceAgentGoldenPair:
    def test_run_returns_output(self, experience_agent, grilling_input):
        result = experience_agent.run(grilling_input)
        assert result.agent_name == "experience"

    def test_output_schema_valid(self, experience_agent, grilling_input):
        result = experience_agent.run(grilling_input)
        parsed = ExperienceOutput(**result.output)
        assert len(parsed.touchpoints) >= 1

    def test_touchpoints_have_variants(self, experience_agent, grilling_input):
        result = experience_agent.run(grilling_input)
        parsed = ExperienceOutput(**result.output)
        for tp in parsed.touchpoints:
            assert len(tp.variants) >= 1

    def test_total_touchpoints_matches_list(self, experience_agent, grilling_input):
        result = experience_agent.run(grilling_input)
        assert result.output["total_touchpoints"] == len(result.output["touchpoints"])

    def test_channels_used_populated(self, experience_agent, grilling_input):
        result = experience_agent.run(grilling_input)
        parsed = ExperienceOutput(**result.output)
        assert len(parsed.channels_used) >= 1

    def test_control_group_pct_valid(self, experience_agent, grilling_input):
        result = experience_agent.run(grilling_input)
        parsed = ExperienceOutput(**result.output)
        assert 0.0 <= parsed.control_group_pct <= 1.0

    def test_engagement_rate_valid(self, experience_agent, grilling_input):
        result = experience_agent.run(grilling_input)
        parsed = ExperienceOutput(**result.output)
        assert 0.0 <= parsed.estimated_engagement_rate <= 1.0

    def test_rationale_present(self, experience_agent, grilling_input):
        result = experience_agent.run(grilling_input)
        assert len(result.output.get("rationale", "")) > 30

    def test_run_id_unique(self, experience_agent, grilling_input):
        r1 = experience_agent.run(grilling_input)
        r2 = experience_agent.run(grilling_input)
        assert r1.run_id != r2.run_id


class TestExperienceAgentPreChecks:
    def test_missing_strategy_raises(self, experience_agent):
        from agent_base.base import PreCheckError
        agent_input = AgentInput(
            campaign_id="x",
            upstream_outputs={"creative": _creative_output(), "targeting": _targeting_output()},
            config=AgentConfig(stub_mode=True),
        )
        with pytest.raises(PreCheckError) as exc_info:
            experience_agent.pre_checks(agent_input)
        assert exc_info.value.check_name == "strategy_required"

    def test_missing_creative_raises(self, experience_agent):
        from agent_base.base import PreCheckError
        agent_input = AgentInput(
            campaign_id="x",
            upstream_outputs={"strategy": _strategy_output(), "targeting": _targeting_output()},
            config=AgentConfig(stub_mode=True),
        )
        with pytest.raises(PreCheckError) as exc_info:
            experience_agent.pre_checks(agent_input)
        assert exc_info.value.check_name == "creative_required"

    def test_creative_with_no_variants_raises(self, experience_agent):
        from agent_base.base import PreCheckError
        agent_input = AgentInput(
            campaign_id="x",
            upstream_outputs={
                "strategy": _strategy_output(),
                "creative": {"variants": [], "channel_variant_count": {}, "copy_length_compliance": {},
                             "brand_voice_notes": "x", "rationale": "x"},
                "targeting": _targeting_output(),
            },
            config=AgentConfig(stub_mode=True),
        )
        with pytest.raises(PreCheckError) as exc_info:
            experience_agent.pre_checks(agent_input)
        assert exc_info.value.check_name == "creative_variants_required"

    def test_missing_targeting_raises(self, experience_agent):
        from agent_base.base import PreCheckError
        agent_input = AgentInput(
            campaign_id="x",
            upstream_outputs={"strategy": _strategy_output(), "creative": _creative_output()},
            config=AgentConfig(stub_mode=True),
        )
        with pytest.raises(PreCheckError) as exc_info:
            experience_agent.pre_checks(agent_input)
        assert exc_info.value.check_name == "targeting_required"

    def test_valid_inputs_pass(self, experience_agent, grilling_input):
        experience_agent.pre_checks(grilling_input)  # must not raise


class TestExperienceAgentPostProcess:
    def test_total_touchpoints_corrected(self, experience_agent):
        output = {
            "touchpoints": [{"step_number": 1}, {"step_number": 2}],
            "total_touchpoints": 99,  # wrong — should be corrected to 2
            "channels_used": [],
        }
        dummy = AgentInput(campaign_id="x", upstream_outputs={}, config=AgentConfig(stub_mode=True))
        result = experience_agent.post_process(output, dummy)
        assert result["total_touchpoints"] == 2

    def test_channels_derived_from_touchpoints(self, experience_agent):
        output = {
            "touchpoints": [
                {"step_number": 1, "channel": "EMAIL"},
                {"step_number": 2, "channel": "PAID_SOCIAL"},
            ],
            "total_touchpoints": 2,
            "channels_used": [],
        }
        dummy = AgentInput(campaign_id="x", upstream_outputs={}, config=AgentConfig(stub_mode=True))
        result = experience_agent.post_process(output, dummy)
        assert "EMAIL" in result["channels_used"]
        assert "PAID_SOCIAL" in result["channels_used"]


class TestExperienceAgentDefaultConfig:
    def test_uses_sonnet_model(self, experience_agent):
        assert experience_agent.default_config.model == "claude-sonnet-5"

    def test_score_threshold(self, experience_agent):
        assert experience_agent.default_config.score_threshold == 3.5

    def test_dimensions(self, experience_agent):
        expected = {"journey_coherence", "creative_coverage", "personalization_logic", "channel_fit"}
        assert set(experience_agent.dimensions) == expected
