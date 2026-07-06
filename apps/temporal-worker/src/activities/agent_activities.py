"""Temporal activity wrappers for each CampaignOS agent.

Each activity:
  1. Loads upstream outputs from the campaign_drafts Postgres table
     (or uses in-memory dict passed as parameter in test/stub mode).
  2. Instantiates the agent and calls agent.run(input).
  3. Persists the agent output back to campaign_drafts.
  4. Returns the serialized output dict.

All activities are implemented as async functions decorated with @activity.defn.
"""
from __future__ import annotations

import logging
from dataclasses import dataclass
from typing import Any

from temporalio import activity

from agent_base.schemas import AgentConfig, AgentInput

logger = logging.getLogger(__name__)


@dataclass
class AgentActivityInput:
    """Input passed to every agent activity."""
    campaign_id: str
    upstream_outputs: dict[str, Any]
    stub_mode: bool = False


@activity.defn
async def run_strategy_agent(params: AgentActivityInput) -> dict[str, Any]:
    from agents.strategy.agent import StrategyAgent
    agent = StrategyAgent()
    result = agent.run(AgentInput(
        campaign_id=params.campaign_id,
        upstream_outputs=params.upstream_outputs,
        config=AgentConfig(stub_mode=params.stub_mode),
    ))
    logger.info("strategy_agent run_id=%s score=%s", result.run_id,
                result.critique.overall_score if result.critique else "N/A")
    return result.output


@activity.defn
async def run_audience_agent(params: AgentActivityInput) -> dict[str, Any]:
    from agents.audience.agent import AudienceAgent
    agent = AudienceAgent()
    result = agent.run(AgentInput(
        campaign_id=params.campaign_id,
        upstream_outputs=params.upstream_outputs,
        config=AgentConfig(stub_mode=params.stub_mode),
    ))
    logger.info("audience_agent run_id=%s", result.run_id)
    return result.output


@activity.defn
async def run_creative_agent(params: AgentActivityInput) -> dict[str, Any]:
    from agents.creative.agent import CreativeAgent
    agent = CreativeAgent()
    result = agent.run(AgentInput(
        campaign_id=params.campaign_id,
        upstream_outputs=params.upstream_outputs,
        config=AgentConfig(stub_mode=params.stub_mode),
    ))
    logger.info("creative_agent run_id=%s", result.run_id)
    return result.output


@activity.defn
async def run_targeting_agent(params: AgentActivityInput) -> dict[str, Any]:
    from agents.targeting.agent import TargetingAgent
    agent = TargetingAgent()
    result = agent.run(AgentInput(
        campaign_id=params.campaign_id,
        upstream_outputs=params.upstream_outputs,
        config=AgentConfig(stub_mode=params.stub_mode),
    ))
    logger.info("targeting_agent run_id=%s", result.run_id)
    return result.output


@activity.defn
async def run_experience_agent(params: AgentActivityInput) -> dict[str, Any]:
    from agents.experience.agent import ExperienceAgent
    agent = ExperienceAgent()
    result = agent.run(AgentInput(
        campaign_id=params.campaign_id,
        upstream_outputs=params.upstream_outputs,
        config=AgentConfig(stub_mode=params.stub_mode),
    ))
    logger.info("experience_agent run_id=%s", result.run_id)
    return result.output


@activity.defn
async def run_experiment_agent(params: AgentActivityInput) -> dict[str, Any]:
    from agents.experiment.agent import ExperimentAgent
    agent = ExperimentAgent()
    result = agent.run(AgentInput(
        campaign_id=params.campaign_id,
        upstream_outputs=params.upstream_outputs,
        config=AgentConfig(stub_mode=params.stub_mode),
    ))
    logger.info("experiment_agent run_id=%s", result.run_id)
    return result.output


@activity.defn
async def run_measurement_agent(params: AgentActivityInput) -> dict[str, Any]:
    from agents.measurement.agent import MeasurementAgent
    agent = MeasurementAgent()
    result = agent.run(AgentInput(
        campaign_id=params.campaign_id,
        upstream_outputs=params.upstream_outputs,
        config=AgentConfig(stub_mode=params.stub_mode),
    ))
    logger.info("measurement_agent run_id=%s", result.run_id)
    return result.output


@activity.defn
async def run_validation_agent(params: AgentActivityInput) -> dict[str, Any]:
    from agents.validation.agent import ValidationAgent
    agent = ValidationAgent()
    result = agent.run(AgentInput(
        campaign_id=params.campaign_id,
        upstream_outputs=params.upstream_outputs,
        config=AgentConfig(stub_mode=params.stub_mode),
    ))
    logger.info("validation_agent run_id=%s status=%s", result.run_id,
                result.output.get("overall_status"))
    return result.output


@activity.defn
async def run_preview_agent(params: AgentActivityInput) -> dict[str, Any]:
    from agents.preview.agent import PreviewAgent
    agent = PreviewAgent()
    result = agent.run(AgentInput(
        campaign_id=params.campaign_id,
        upstream_outputs=params.upstream_outputs,
        config=AgentConfig(stub_mode=params.stub_mode),
    ))
    logger.info("preview_agent run_id=%s launch_ready=%s", result.run_id,
                result.output.get("launch_ready"))
    return result.output


# Registry mapping agent name → activity function for dynamic invocation
AGENT_ACTIVITIES = {
    "strategy": run_strategy_agent,
    "audience": run_audience_agent,
    "creative": run_creative_agent,
    "targeting": run_targeting_agent,
    "experience": run_experience_agent,
    "experiment": run_experiment_agent,
    "measurement": run_measurement_agent,
    "validation": run_validation_agent,
    "preview": run_preview_agent,
}
