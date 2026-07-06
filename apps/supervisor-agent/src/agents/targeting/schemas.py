"""Targeting agent output schema — channel targeting configs, bid strategies, reach estimates."""
from __future__ import annotations

from enum import Enum
from typing import Any

from pydantic import BaseModel, Field, model_validator


class BidStrategy(str, Enum):
    CPM = "CPM"
    CPC = "CPC"
    CPA = "CPA"
    CPV = "CPV"
    FIXED = "FIXED"


class FrequencyCap(BaseModel):
    cap_type: str = Field("IMPRESSIONS", description="IMPRESSIONS | CLICKS | CONVERSIONS")
    max_count: int = Field(..., ge=1)
    window_hours: int = Field(24, ge=1)


class GeoTarget(BaseModel):
    geo_type: str = Field(..., description="DMA | STATE | ZIP | STORE_RADIUS | NATIONAL")
    geo_reference_id: str = Field(..., description="DMA code, state FIPS, ZIP, or store_id")
    include_or_exclude: str = Field("INCLUDE", description="INCLUDE | EXCLUDE")


class DaypartSchedule(BaseModel):
    day_of_week: list[str] = Field(
        ..., description="MON, TUE, WED, THU, FRI, SAT, SUN or ALL"
    )
    start_hour: int = Field(..., ge=0, le=23)
    end_hour: int = Field(..., ge=0, le=23)


class ChannelTargetingConfig(BaseModel):
    channel: str = Field(..., description="EMAIL, PAID_SOCIAL, DISPLAY, SMS, PUSH, etc.")
    audience_segment_keys: list[str] = Field(
        ..., min_length=1, description="Audience segment keys this config targets"
    )
    bid_strategy: BidStrategy
    bid_amount_cents: int = Field(..., ge=0)
    daily_budget_cents: int = Field(..., ge=0)
    frequency_caps: list[FrequencyCap] = Field(default_factory=list)
    geo_targets: list[GeoTarget] = Field(default_factory=list)
    daypart_schedules: list[DaypartSchedule] = Field(default_factory=list)
    estimated_reach: int = Field(..., ge=0, description="Estimated unique reach for this config")
    estimated_impressions: int = Field(..., ge=0)
    estimated_cpm_cents: int = Field(..., ge=0, description="Estimated CPM in cents")


class TargetingOutput(BaseModel):
    """Complete targeting configuration plan produced by the TargetingAgent."""

    channel_configs: list[ChannelTargetingConfig] = Field(
        ..., min_length=1, description="One config per channel in the strategy channel mix"
    )
    total_budget_media_cents: int = Field(
        ..., gt=0, description="Sum of all channel daily_budget_cents × flight_days"
    )
    total_estimated_reach: int = Field(
        ..., ge=0, description="Total deduplicated reach across all channels"
    )
    total_estimated_impressions: int = Field(..., ge=0)
    flight_days: int = Field(..., gt=0, description="Campaign flight duration in days")
    reach_deviation_pct: float = Field(
        ...,
        description="% deviation of estimated reach vs audience total_estimated_size. "
        "Positive = over-reach; negative = under-reach.",
    )
    suppression_audience_keys: list[str] = Field(
        default_factory=list,
        description="Audience segment keys to suppress across all channels",
    )
    rationale: str = Field(..., description="Why this targeting approach maximizes campaign ROI")
    risk_notes: list[str] = Field(
        default_factory=list,
        description="Targeting risks: CPM spikes, reach shortfalls, frequency waste, etc.",
    )

    @model_validator(mode="after")
    def check_budget_sum(self) -> "TargetingOutput":
        channel_sum = sum(c.daily_budget_cents * self.flight_days for c in self.channel_configs)
        if self.total_budget_media_cents > 0 and channel_sum > 0:
            ratio = channel_sum / self.total_budget_media_cents
            if ratio > 1.15:
                raise ValueError(
                    f"Channel budget sum ({channel_sum}) exceeds total_budget_media_cents "
                    f"({self.total_budget_media_cents}) by more than 15%"
                )
        return self
