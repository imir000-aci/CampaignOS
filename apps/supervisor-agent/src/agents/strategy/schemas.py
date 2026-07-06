"""Strategy agent output schema — the structured plan produced for each campaign."""
from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field


class KpiTarget(BaseModel):
    metric_name: str
    target_value: float
    measurement_window_days: int = 30
    attribution_model: str = "LAST_TOUCH"


class ChannelMix(BaseModel):
    channels: list[str] = Field(
        ...,
        description="List of marketing channels (EMAIL, PAID_SOCIAL, DISPLAY, SMS, PUSH, etc.)",
        min_length=1,
    )
    primary_channel: str
    channel_allocation: dict[str, float] = Field(
        default_factory=dict,
        description="Budget allocation per channel as fraction of media budget (sums to 1.0)",
    )


class TargetMarket(BaseModel):
    description: str
    segments: list[str] = Field(default_factory=list, description="Audience segment keys")
    geography: str = "National"
    age_bands: list[str] = Field(default_factory=list)


class StrategyOutput(BaseModel):
    """Complete strategy plan produced by the StrategyAgent."""

    objective: str = Field(..., description="Primary campaign objective in one sentence")
    channel_mix: ChannelMix
    target_market: TargetMarket
    messaging_pillars: list[str] = Field(
        ...,
        description="3-5 core messaging themes/pillars for this campaign",
        min_length=1,
        max_length=5,
    )
    kpi_targets: list[KpiTarget] = Field(
        ...,
        description="Measurable KPI targets for the campaign",
        min_length=1,
    )
    budget_total_cents: int = Field(..., gt=0)
    budget_media_cents: int = Field(..., gt=0)
    budget_production_cents: int = Field(..., ge=0)
    start_date: str = Field(..., description="ISO date YYYY-MM-DD")
    end_date: str = Field(..., description="ISO date YYYY-MM-DD")
    creative_brief_summary: str = Field(
        ...,
        description="One paragraph brief for the creative team",
    )
    risks: list[str] = Field(
        default_factory=list,
        description="Key risks and mitigation notes",
    )
    rationale: str = Field(
        ...,
        description="Strategic rationale — why this approach fits the brand objective",
    )
