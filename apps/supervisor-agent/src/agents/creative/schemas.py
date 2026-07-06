"""Creative agent output schema — copy variants for all campaign channels (copy only, no images)."""
from __future__ import annotations

from pydantic import BaseModel, Field, computed_field


# Channel copy length specs (max words for body unless specified)
CHANNEL_COPY_SPECS: dict[str, dict[str, int]] = {
    "EMAIL": {"headline_chars": 50, "body_words": 200, "cta_words": 8},
    "PAID_SOCIAL": {"headline_chars": 40, "body_words": 125, "cta_words": 5},
    "SMS": {"total_chars": 160, "cta_words": 10},
    "PUSH": {"headline_chars": 40, "body_chars": 100, "cta_words": 4},
    "DISPLAY": {"headline_chars": 30, "body_chars": 90, "cta_words": 4},
}


class CopyVariant(BaseModel):
    variant_key: str = Field(..., description="Unique snake_case key (e.g. email_heavy_grillers_v1)")
    channel: str = Field(..., description="EMAIL, PAID_SOCIAL, SMS, PUSH, DISPLAY, etc.")
    headline: str = Field(..., description="Primary headline text")
    body_copy: str = Field(..., description="Body copy text")
    cta_text: str = Field(..., description="Call-to-action button/link text")
    messaging_pillar_ref: str = Field(
        ..., description="Which strategy messaging pillar this variant addresses"
    )
    audience_segment_ref: str | None = Field(
        None, description="Specific segment this variant is optimized for; None = all segments"
    )
    tone: str = Field(..., description="Tone of voice (e.g. 'warm_urgent', 'playful', 'premium')")

    @computed_field  # type: ignore[misc]
    @property
    def word_count(self) -> int:
        return len(self.body_copy.split())


class CreativeOutput(BaseModel):
    """Complete copy plan produced by the CreativeAgent (copy only — no image generation yet)."""

    variants: list[CopyVariant] = Field(
        ...,
        min_length=1,
        max_length=10,
        description="2-3 copy variants per channel",
    )
    channel_variant_count: dict[str, int] = Field(
        default_factory=dict,
        description="Number of variants produced per channel",
    )
    copy_length_compliance: dict[str, bool] = Field(
        default_factory=dict,
        description="Per channel: True if all variants are within spec limits",
    )
    brand_voice_notes: str = Field(
        ..., description="Notes on brand voice application — tone, style, guidelines followed"
    )
    rationale: str = Field(
        ..., description="Why this copy approach best serves the campaign strategy"
    )
