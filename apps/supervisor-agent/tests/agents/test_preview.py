"""Golden-pair standalone tests for PreviewAgent.

Run with: AGENT_LLM_STUB=true pytest tests/agents/test_preview.py -v
"""
from __future__ import annotations

import os

os.environ.setdefault("AGENT_LLM_STUB", "true")

import pytest

from agent_base.schemas import AgentConfig, AgentInput
from agents.preview.agent import PreviewAgent
from agents.preview.schemas import CampaignPreview


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


def _validation_pass_with_warnings() -> dict:
    return {
        "overall_status": "PASS_WITH_WARNINGS",
        "completeness_score": 0.9,
        "completeness_checks": [{"check_name": "strategy_present", "agent_name": "strategy",
                                  "passed": True, "notes": ""}],
        "violations": [{"violation_id": "v001", "severity": "WARNING", "category": "MEASUREMENT",
                        "description": "Missing KPI", "affected_agent": "measurement",
                        "remediation": "Add KPI definition"}],
        "blocking_violations": [],
        "brand_compliance_score": 0.95,
        "regulatory_compliance_score": 1.0,
        "launch_readiness": True,
        "rationale": "All required agents present with one warning.",
        "recommendations": [],
    }


def _validation_fail() -> dict:
    return {
        "overall_status": "FAIL",
        "completeness_score": 0.5,
        "completeness_checks": [],
        "violations": [{"violation_id": "v001", "severity": "CRITICAL", "category": "BUDGET",
                        "description": "Budget overrun", "affected_agent": "targeting",
                        "remediation": "Reduce spend"}],
        "blocking_violations": ["v001"],
        "brand_compliance_score": 0.8,
        "regulatory_compliance_score": 0.9,
        "launch_readiness": False,
        "rationale": "FAIL due to budget overrun.",
        "recommendations": [],
    }


def _full_upstream() -> dict:
    return {
        "strategy": _strategy_output(),
        "audience": {
            "segments": [{"segment_key": "heavy_grillers_loyal", "name": "Heavy",
                          "description": "desc", "rule": {"logic": "AND", "conditions": [], "sub_groups": []},
                          "estimated_size": 280000, "priority": 1}],
            "total_estimated_size": 800000, "primary_audience_description": "Grilling members.",
            "suppression_rules": [], "privacy_risk_level": "LOW",
            "privacy_notes": [], "channel_size_estimates": {}, "rationale": "SW",
        },
        "creative": {
            "variants": [{"variant_key": "email_premium_grilling_v1", "channel": "EMAIL",
                          "headline": "Your Best Cookout", "body_copy": "Premium cuts at loyalty prices.",
                          "cta_text": "Shop Loyalty Deals", "messaging_pillar_ref": "Premium grilling",
                          "audience_segment_ref": None, "tone": "warm_premium"}],
            "channel_variant_count": {"EMAIL": 1}, "copy_length_compliance": {"EMAIL": True},
            "brand_voice_notes": "Warm.", "rationale": "One channel.",
        },
        "targeting": {
            "channel_configs": [{"channel": "EMAIL", "audience_segment_keys": ["heavy_grillers_loyal"],
                                  "bid_strategy": "CPM", "bid_amount_cents": 150, "daily_budget_cents": 68750,
                                  "frequency_caps": [], "geo_targets": [], "daypart_schedules": [],
                                  "estimated_reach": 720000, "estimated_impressions": 2160000,
                                  "estimated_cpm_cents": 150}],
            "total_budget_media_cents": 37_500_000, "total_estimated_reach": 720000,
            "total_estimated_impressions": 2160000, "flight_days": 91,
            "reach_deviation_pct": 0.0, "suppression_audience_keys": [], "rationale": ".", "risk_notes": [],
        },
        "experience": {
            "journey_name": "Summer Grilling Journey", "journey_description": "Multi-touch.",
            "touchpoints": [], "total_touchpoints": 0, "channels_used": ["EMAIL"],
            "personalization_enabled": True, "control_group_pct": 0.1,
            "estimated_engagement_rate": 0.045, "rationale": ".", "risk_notes": [],
        },
        "validation": _validation_pass_with_warnings(),
    }


@pytest.fixture(scope="module")
def preview_agent() -> PreviewAgent:
    return PreviewAgent()


@pytest.fixture(scope="module")
def campaign_input() -> AgentInput:
    return AgentInput(
        campaign_id="550e8400-e29b-41d4-a716-446655440008",
        upstream_outputs=_full_upstream(),
        config=AgentConfig(stub_mode=True),
    )


class TestPreviewAgentGoldenPair:
    def test_run_returns_output(self, preview_agent, campaign_input):
        result = preview_agent.run(campaign_input)
        assert result.agent_name == "preview"

    def test_output_schema_valid(self, preview_agent, campaign_input):
        result = preview_agent.run(campaign_input)
        parsed = CampaignPreview(**result.output)
        assert len(parsed.sections) >= 3

    def test_campaign_title_present(self, preview_agent, campaign_input):
        result = preview_agent.run(campaign_input)
        assert len(result.output.get("campaign_title", "")) > 0

    def test_executive_summary_present(self, preview_agent, campaign_input):
        result = preview_agent.run(campaign_input)
        assert len(result.output.get("executive_summary", "")) > 30

    def test_channel_previews_populated(self, preview_agent, campaign_input):
        result = preview_agent.run(campaign_input)
        parsed = CampaignPreview(**result.output)
        assert len(parsed.channel_previews) >= 1

    def test_checklist_populated(self, preview_agent, campaign_input):
        result = preview_agent.run(campaign_input)
        parsed = CampaignPreview(**result.output)
        assert len(parsed.checklist) >= 1

    def test_flight_dates_present(self, preview_agent, campaign_input):
        result = preview_agent.run(campaign_input)
        assert "→" in result.output.get("flight_dates", "")

    def test_launch_ready_synced_with_validation(self, preview_agent, campaign_input):
        result = preview_agent.run(campaign_input)
        # validation is PASS_WITH_WARNINGS → launch_ready should be True
        assert result.output.get("launch_ready") is True

    def test_validation_status_synced(self, preview_agent, campaign_input):
        result = preview_agent.run(campaign_input)
        assert result.output.get("validation_status") == "PASS_WITH_WARNINGS"

    def test_run_id_unique(self, preview_agent, campaign_input):
        r1 = preview_agent.run(campaign_input)
        r2 = preview_agent.run(campaign_input)
        assert r1.run_id != r2.run_id


class TestPreviewAgentPreChecks:
    def test_missing_validation_raises(self, preview_agent):
        from agent_base.base import PreCheckError
        agent_input = AgentInput(
            campaign_id="x",
            upstream_outputs={"strategy": _strategy_output()},
            config=AgentConfig(stub_mode=True),
        )
        with pytest.raises(PreCheckError) as exc_info:
            preview_agent.pre_checks(agent_input)
        assert exc_info.value.check_name == "validation_required"

    def test_fail_validation_blocks_preview(self, preview_agent):
        from agent_base.base import PreCheckError
        agent_input = AgentInput(
            campaign_id="x",
            upstream_outputs={"validation": _validation_fail()},
            config=AgentConfig(stub_mode=True),
        )
        with pytest.raises(PreCheckError) as exc_info:
            preview_agent.pre_checks(agent_input)
        assert exc_info.value.check_name == "validation_must_not_fail"

    def test_pass_with_warnings_does_not_block(self, preview_agent):
        agent_input = AgentInput(
            campaign_id="x",
            upstream_outputs={"validation": _validation_pass_with_warnings()},
            config=AgentConfig(stub_mode=True),
        )
        preview_agent.pre_checks(agent_input)  # must not raise

    def test_pass_validation_does_not_block(self, preview_agent):
        pass_validation = {**_validation_pass_with_warnings(), "overall_status": "PASS", "violations": []}
        agent_input = AgentInput(
            campaign_id="x",
            upstream_outputs={"validation": pass_validation},
            config=AgentConfig(stub_mode=True),
        )
        preview_agent.pre_checks(agent_input)  # must not raise


class TestPreviewAgentPostProcess:
    def test_launch_ready_synced_from_validation(self, preview_agent):
        output = {
            "campaign_title": "Test", "executive_summary": "Summary.",
            "sections": [], "channel_previews": [],
            "checklist": [], "estimated_total_reach": 0,
            "estimated_total_budget_usd": 0.0, "flight_dates": "2026-06-01 → 2026-08-31",
            "approval_urgency": "LOW",
            "validation_status": "UNKNOWN",  # will be overridden
            "launch_ready": False,  # will be overridden
            "rationale": "test",
        }
        dummy = AgentInput(
            campaign_id="x",
            upstream_outputs={"validation": _validation_pass_with_warnings()},
            config=AgentConfig(stub_mode=True),
        )
        result = preview_agent.post_process(output, dummy)
        assert result["validation_status"] == "PASS_WITH_WARNINGS"
        assert result["launch_ready"] is True

    def test_post_process_no_validation_upstream(self, preview_agent):
        output = {
            "campaign_title": "Test", "executive_summary": "Summary.",
            "sections": [], "channel_previews": [],
            "checklist": [], "estimated_total_reach": 0,
            "estimated_total_budget_usd": 0.0, "flight_dates": "2026-06-01 → 2026-08-31",
            "approval_urgency": "LOW",
            "validation_status": "PASS",
            "launch_ready": True,
            "rationale": "test",
        }
        dummy = AgentInput(campaign_id="x", upstream_outputs={}, config=AgentConfig(stub_mode=True))
        result = preview_agent.post_process(output, dummy)
        # No change when no validation in upstream
        assert result["validation_status"] == "PASS"
        assert result["launch_ready"] is True


class TestPreviewAgentDefaultConfig:
    def test_uses_haiku_model(self, preview_agent):
        assert preview_agent.default_config.model == "claude-haiku-4-5-20251001"

    def test_max_iterations_is_one(self, preview_agent):
        assert preview_agent.default_config.max_iterations == 1

    def test_score_threshold(self, preview_agent):
        assert preview_agent.default_config.score_threshold == 3.5

    def test_dimensions(self, preview_agent):
        expected = {"rendering_completeness", "summary_accuracy", "checklist_coverage"}
        assert set(preview_agent.dimensions) == expected
