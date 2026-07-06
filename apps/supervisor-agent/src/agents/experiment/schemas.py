"""Experiment agent output schema — A/B and multivariate experiment designs."""
from __future__ import annotations

from enum import Enum

from pydantic import BaseModel, Field, model_validator


class ExperimentType(str, Enum):
    AB = "AB"
    MULTIVARIATE = "MULTIVARIATE"
    HOLDOUT = "HOLDOUT"
    GEO_SPLIT = "GEO_SPLIT"


class ExperimentVariant(BaseModel):
    variant_key: str
    is_control: bool
    allocation_pct: float = Field(..., ge=0.0, le=100.0, description="Traffic allocation percentage (0-100)")
    description: str


class SampleSizeCalc(BaseModel):
    metric_name: str
    baseline_rate: float
    mde: float = Field(..., description="Minimum detectable effect")
    confidence_level: float = 0.95
    power: float = 0.8
    required_sample_size: int
    test_duration_days: int


class ExperimentOutput(BaseModel):
    """Complete experiment design produced by the ExperimentAgent."""

    experiment_type: ExperimentType
    hypothesis: str = Field(
        ..., description="Clear null hypothesis and alternative hypothesis statement"
    )
    variants: list[ExperimentVariant] = Field(
        ...,
        min_length=2,
        description="Experiment variants — must include exactly 1 control",
    )
    primary_metric: str = Field(..., description="The primary KPI being measured")
    secondary_metrics: list[str] = Field(
        default_factory=list,
        description="Additional metrics tracked but not used for significance testing",
    )
    sample_size_calculations: list[SampleSizeCalc] = Field(
        ...,
        min_length=1,
        description="Statistical sample size requirements per metric",
    )
    test_duration_days: int = Field(..., gt=0, description="Number of days to run the experiment")
    minimum_detectable_effect: float = Field(
        ..., gt=0.0, description="Smallest effect size worth detecting"
    )
    confidence_level: float = Field(
        ..., ge=0.8, le=0.99, description="Statistical confidence level (e.g. 0.95)"
    )
    statistical_power: float = Field(
        ..., ge=0.7, le=0.99, description="Desired statistical power (e.g. 0.8)"
    )
    rationale: str = Field(
        ..., description="Why this experiment design maximizes learning for the campaign KPIs"
    )
    risk_notes: list[str] = Field(
        default_factory=list,
        description="Risks and mitigations for the experiment",
    )

    @model_validator(mode="after")
    def validate_variants(self) -> "ExperimentOutput":
        """Validate allocation sum and control count."""
        total_alloc = sum(v.allocation_pct for v in self.variants)
        if abs(total_alloc - 100.0) > 0.01:
            raise ValueError(
                f"Variant allocation_pct values must sum to 100.0, got {total_alloc:.4f}"
            )
        control_count = sum(1 for v in self.variants if v.is_control)
        if control_count != 1:
            raise ValueError(
                f"Exactly 1 control variant required, got {control_count}"
            )
        return self
