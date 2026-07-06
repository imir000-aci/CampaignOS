"""Experience agent output schema — customer journeys, touchpoints, personalization rules."""
from __future__ import annotations

from enum import Enum

from pydantic import BaseModel, Field


class ExperienceType(str, Enum):
    EMAIL = "EMAIL"
    PUSH = "PUSH"
    SMS = "SMS"
    LANDING_PAGE = "LANDING_PAGE"
    IN_APP = "IN_APP"
    DISPLAY = "DISPLAY"
    PAID_SOCIAL = "PAID_SOCIAL"


class PersonalizationRule(BaseModel):
    rule_id: str
    condition: str = Field(..., description="Human-readable condition (e.g. 'segment == heavy_grillers_loyal')")
    slot_key: str = Field(..., description="Which experience slot this rule controls")
    value_when_true: str = Field(..., description="Content or asset key when condition is true")
    value_when_false: str = Field(..., description="Content or asset key when condition is false")


class ExperienceVariant(BaseModel):
    variant_key: str
    is_control: bool = False
    weight: float = Field(..., ge=0.0, le=1.0, description="Traffic allocation (0-1)")
    description: str
    copy_variant_key: str | None = Field(
        None, description="Reference to a CreativeOutput copy variant key"
    )
    personalization_rules: list[PersonalizationRule] = Field(default_factory=list)


class TouchpointStep(BaseModel):
    step_number: int = Field(..., ge=1)
    channel: str
    trigger: str = Field(
        ...,
        description="What triggers this step: CAMPAIGN_START, DAY_N, SEGMENT_ENTRY, "
        "PURCHASE_EVENT, NO_OPEN_7D, etc.",
    )
    delay_hours: int = Field(0, ge=0, description="Hours after trigger to wait before sending")
    experience_type: ExperienceType
    variants: list[ExperienceVariant] = Field(..., min_length=1)
    audience_segment_keys: list[str] = Field(
        ..., min_length=1, description="Which segments receive this touchpoint"
    )


class ExperienceOutput(BaseModel):
    """Complete customer journey and experience design from the ExperienceAgent."""

    journey_name: str = Field(..., description="Descriptive name for this customer journey")
    journey_description: str
    touchpoints: list[TouchpointStep] = Field(
        ...,
        min_length=1,
        description="Ordered sequence of customer touchpoints",
    )
    total_touchpoints: int = Field(..., ge=1)
    channels_used: list[str] = Field(..., min_length=1)
    personalization_enabled: bool = Field(
        True, description="Whether personalization rules are active"
    )
    control_group_pct: float = Field(
        ..., ge=0.0, le=1.0, description="Fraction of audience in control (holdout) group"
    )
    estimated_engagement_rate: float = Field(
        ..., ge=0.0, le=1.0,
        description="Predicted average engagement rate across all touchpoints",
    )
    rationale: str = Field(
        ..., description="Why this journey design maximizes conversion for the target audience"
    )
    risk_notes: list[str] = Field(default_factory=list)
