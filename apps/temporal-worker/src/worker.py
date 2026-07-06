"""Temporal worker entry point for CampaignOS.

Run with: python -m src.worker

Registers all activities and the CampaignCreationWorkflow against a running
Temporal server (docker-compose: temporal:7233).
"""
from __future__ import annotations

import asyncio
import logging
import os

from temporalio.client import Client
from temporalio.worker import Worker

from src.activities.agent_activities import (
    AGENT_ACTIVITIES,
    run_audience_agent,
    run_creative_agent,
    run_experience_agent,
    run_experiment_agent,
    run_measurement_agent,
    run_preview_agent,
    run_strategy_agent,
    run_targeting_agent,
    run_validation_agent,
)
from src.workflows.campaign_creation import CampaignCreationWorkflow

TEMPORAL_HOST = os.environ.get("TEMPORAL_HOST", "localhost:7233")
TASK_QUEUE = os.environ.get("TEMPORAL_TASK_QUEUE", "campaignos-campaign-creation")

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


async def main() -> None:
    client = await Client.connect(TEMPORAL_HOST)
    async with Worker(
        client,
        task_queue=TASK_QUEUE,
        workflows=[CampaignCreationWorkflow],
        activities=[
            run_strategy_agent,
            run_audience_agent,
            run_creative_agent,
            run_targeting_agent,
            run_experience_agent,
            run_experiment_agent,
            run_measurement_agent,
            run_validation_agent,
            run_preview_agent,
        ],
    ):
        logger.info("Worker started — listening on %s queue=%s", TEMPORAL_HOST, TASK_QUEUE)
        await asyncio.Future()  # run forever


if __name__ == "__main__":
    asyncio.run(main())
