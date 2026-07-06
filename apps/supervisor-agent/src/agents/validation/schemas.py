"""Validation agent output schema — compliance, completeness, brand/regulatory checks."""
from __future__ import annotations

from enum import Enum

from pydantic import BaseModel, Field


class ViolationSeverity(str, Enum):
    CRITICAL = "CRITICAL"
    WARNING = "WARNING"
    INFO = "INFO"


class ComplianceCategory(str, Enum):
    BRAND = "BRAND"
    REGULATORY = "REGULATORY"
    PLATFORM = "PLATFORM"
    BUDGET = "BUDGET"
    AUDIENCE = "AUDIENCE"
    CREATIVE = "CREATIVE"
    EXPERIMENT = "EXPERIMENT"
    MEASUREMENT = "MEASUREMENT"


class ComplianceViolation(BaseModel):
    violation_id: str
    severity: ViolationSeverity
    category: ComplianceCategory
    description: str
    affected_agent: str = Field(..., description="Which agent's output triggered this violation")
    remediation: str = Field(..., description="How to fix this violation")


class CompletenessCheck(BaseModel):
    check_name: str
    agent_name: str
    passed: bool
    notes: str = ""


class ValidationOutput(BaseModel):
    """Complete validation report produced by the ValidationAgent."""

    overall_status: str = Field(
        ...,
        description="PASS | FAIL | PASS_WITH_WARNINGS — FAIL blocks launch",
    )
    completeness_score: float = Field(
        ..., ge=0.0, le=1.0, description="Fraction of completeness checks that passed"
    )
    completeness_checks: list[CompletenessCheck] = Field(
        ..., min_length=1, description="Per-agent completeness gate results"
    )
    violations: list[ComplianceViolation] = Field(
        default_factory=list,
        description="All compliance violations found; CRITICAL violations → overall_status=FAIL",
    )
    blocking_violations: list[str] = Field(
        default_factory=list,
        description="violation_ids with severity=CRITICAL that must be resolved before launch",
    )
    brand_compliance_score: float = Field(
        ..., ge=0.0, le=1.0, description="Brand guideline adherence score"
    )
    regulatory_compliance_score: float = Field(
        ..., ge=0.0, le=1.0, description="Regulatory / platform policy adherence score"
    )
    launch_readiness: bool = Field(
        ...,
        description="True if campaign may proceed to launch (no blocking violations)",
    )
    rationale: str
    recommendations: list[str] = Field(
        default_factory=list,
        description="Non-blocking improvements suggested before launch",
    )
