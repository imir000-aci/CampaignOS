"""Audience agent output schema — defines segments, targeting rules, and privacy flags."""
from __future__ import annotations

from enum import Enum
from typing import Any

from pydantic import BaseModel, Field


class PrivacyRiskLevel(str, Enum):
    LOW = "LOW"
    MEDIUM = "MEDIUM"
    HIGH = "HIGH"


class AudienceRuleCondition(BaseModel):
    field: str = Field(..., description="Customer attribute field (e.g. 'loyalty_tier', 'age_band')")
    operator: str = Field(..., description="Comparison operator: IN, NOT_IN, GTE, LTE, EQ, NEQ")
    value: Any = Field(..., description="Comparison value; list for IN/NOT_IN operators")


class AudienceRuleGroup(BaseModel):
    logic: str = Field("AND", description="Logical combinator: AND | OR")
    conditions: list[AudienceRuleCondition] = Field(default_factory=list)
    sub_groups: list["AudienceRuleGroup"] = Field(default_factory=list)


class SegmentDefinition(BaseModel):
    segment_key: str = Field(..., description="Unique snake_case key for this segment")
    name: str
    description: str
    rule: AudienceRuleGroup
    estimated_size: int = Field(..., ge=0)
    priority: int = Field(1, ge=1, le=10, description="1=highest priority for creative allocation")


class SuppressionRule(BaseModel):
    reason: str
    rule: AudienceRuleGroup


class AudienceOutput(BaseModel):
    """Complete audience plan produced by the AudienceAgent."""

    primary_audience_description: str = Field(
        ..., description="One-paragraph description of the overall target audience"
    )
    segments: list[SegmentDefinition] = Field(
        ...,
        description="2-5 addressable audience segments",
        min_length=1,
        max_length=5,
    )
    total_estimated_size: int = Field(
        ..., ge=1000, description="Total addressable audience size (deduplicated)"
    )
    suppression_rules: list[SuppressionRule] = Field(
        default_factory=list,
        description="Audiences to exclude (recent purchasers, opted-out, etc.)",
    )
    lookalike_seed_segment_key: str | None = Field(
        None,
        description="Segment key to use as lookalike seed; None if not applicable",
    )
    privacy_risk_level: PrivacyRiskLevel = Field(
        PrivacyRiskLevel.LOW,
        description="Overall privacy risk assessment for this audience plan",
    )
    privacy_notes: list[str] = Field(
        default_factory=list,
        description="Privacy considerations and mitigations",
    )
    channel_size_estimates: dict[str, int] = Field(
        default_factory=dict,
        description="Estimated addressable size per channel (EMAIL, PAID_SOCIAL, etc.)",
    )
    rationale: str = Field(
        ..., description="Why this audience structure best serves the campaign strategy"
    )
