"""Measurement agent output schema — KPI definitions, attribution, anomaly thresholds."""
from __future__ import annotations

from enum import Enum

from pydantic import BaseModel, Field


class AttributionModel(str, Enum):
    LAST_TOUCH = "LAST_TOUCH"
    FIRST_TOUCH = "FIRST_TOUCH"
    LINEAR = "LINEAR"
    TIME_DECAY = "TIME_DECAY"
    DATA_DRIVEN = "DATA_DRIVEN"


class MeasurementCadence(str, Enum):
    HOURLY = "HOURLY"
    DAILY = "DAILY"
    WEEKLY = "WEEKLY"
    CAMPAIGN_END = "CAMPAIGN_END"


class DataSource(str, Enum):
    ACTIVATION_EVENTS = "ACTIVATION_EVENTS"
    POS_TRANSACTIONS = "POS_TRANSACTIONS"
    LOYALTY_EVENTS = "LOYALTY_EVENTS"
    OFFER_REDEMPTIONS = "OFFER_REDEMPTIONS"
    EMAIL_EVENTS = "EMAIL_EVENTS"
    PAID_MEDIA_EVENTS = "PAID_MEDIA_EVENTS"
    SMS_EVENTS = "SMS_EVENTS"
    PUSH_EVENTS = "PUSH_EVENTS"


class KpiDefinition(BaseModel):
    metric_name: str
    description: str
    formula: str = Field(..., description="How to compute the metric from raw data")
    data_sources: list[DataSource] = Field(..., min_length=1)
    attribution_model: AttributionModel
    measurement_cadence: MeasurementCadence
    target_value: float | None = None
    measurement_window_days: int = Field(..., gt=0)


class AnomalyThreshold(BaseModel):
    metric_name: str
    lower_bound_pct: float = Field(
        ..., description="Alert if metric drops below this % of expected value"
    )
    upper_bound_pct: float = Field(
        ..., description="Alert if metric rises above this % of expected value"
    )
    severity: str = Field(..., description="INFO | WARNING | CRITICAL")
    action: str = Field(..., description="What to do when threshold is breached")


class TrackingRequirement(BaseModel):
    channel: str
    event_name: str
    data_source: DataSource
    required: bool = True
    notes: str = ""


class MeasurementOutput(BaseModel):
    """Complete measurement plan produced by the MeasurementAgent."""

    kpi_definitions: list[KpiDefinition] = Field(
        ..., min_length=1, description="Measurement definitions for all strategy KPIs"
    )
    primary_attribution_model: AttributionModel
    attribution_window_days: int = Field(..., gt=0)
    anomaly_thresholds: list[AnomalyThreshold] = Field(
        ...,
        min_length=1,
        description="Alert thresholds for key metrics",
    )
    tracking_requirements: list[TrackingRequirement] = Field(
        ...,
        min_length=1,
        description="Per-channel tracking events needed for attribution",
    )
    channels_without_measurement: list[str] = Field(
        default_factory=list,
        description="Channels that lack full measurement coverage",
    )
    lift_study_eligible: bool = Field(
        ..., description="Whether this campaign can support an incremental lift study"
    )
    rationale: str
    risk_notes: list[str] = Field(default_factory=list)
