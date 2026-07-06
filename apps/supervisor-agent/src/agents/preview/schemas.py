"""Preview agent output schema — rendered campaign preview artifact for human review."""
from __future__ import annotations

from enum import Enum

from pydantic import BaseModel, Field


class PreviewSection(BaseModel):
    section_key: str
    title: str
    content: str = Field(..., description="Markdown-formatted summary of this section")
    status: str = Field(..., description="READY | INCOMPLETE | WARNING")


class ChannelPreview(BaseModel):
    channel: str
    headline: str
    body_copy_excerpt: str = Field(..., description="First 150 chars of body copy")
    cta_text: str
    audience_size_estimate: int
    estimated_reach: int


class CampaignPreview(BaseModel):
    """Complete campaign preview artifact produced by the PreviewAgent."""

    campaign_title: str = Field(..., description="Human-readable campaign title for the approval request")
    executive_summary: str = Field(
        ..., description="2-3 sentence summary for approvers who won't read the full package"
    )
    sections: list[PreviewSection] = Field(
        ..., min_length=3, description="Structured sections covering each agent's output"
    )
    channel_previews: list[ChannelPreview] = Field(
        ..., min_length=1, description="Per-channel sample of what the campaign will look like"
    )
    checklist: list[str] = Field(
        ..., min_length=1, description="Launch checklist items the approver should verify"
    )
    estimated_total_reach: int
    estimated_total_budget_usd: float
    flight_dates: str = Field(..., description="'YYYY-MM-DD → YYYY-MM-DD'")
    approval_urgency: str = Field(
        ..., description="LOW | MEDIUM | HIGH — based on campaign start proximity"
    )
    validation_status: str = Field(
        ..., description="PASS | PASS_WITH_WARNINGS | FAIL — from ValidationAgent"
    )
    launch_ready: bool
    rationale: str
