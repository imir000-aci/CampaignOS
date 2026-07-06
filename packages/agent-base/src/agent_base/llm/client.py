"""Anthropic SDK wrapper — enforces Anthropic-only models per project constraints."""
from __future__ import annotations

import os
from typing import Any

import anthropic
from pydantic import BaseModel

# Allowed model identifiers (Anthropic ONLY — no OpenAI/GPT allowed)
ALLOWED_MODELS = {
    "claude-haiku-4-5-20251001",
    "claude-sonnet-5",
    "claude-opus-4-8",
    # Legacy names kept for compatibility
    "claude-3-5-haiku-latest",
    "claude-3-5-sonnet-latest",
    "claude-opus-4",
}


class Message(BaseModel):
    role: str  # "user" | "assistant"
    content: str


class ToolDefinition(BaseModel):
    name: str
    description: str
    input_schema: dict[str, Any]


class LlmUsage(BaseModel):
    input_tokens: int
    output_tokens: int

    @property
    def estimated_cost_usd(self) -> float:
        # Approximate pricing as of 2026; update as needed
        costs = {
            "claude-haiku-4-5-20251001": (0.80, 4.00),   # ($/M in, $/M out)
            "claude-3-5-haiku-latest": (0.80, 4.00),
            "claude-sonnet-5": (3.00, 15.00),
            "claude-3-5-sonnet-latest": (3.00, 15.00),
            "claude-opus-4-8": (15.00, 75.00),
            "claude-opus-4": (15.00, 75.00),
        }
        in_price, out_price = costs.get("claude-haiku-4-5-20251001", (3.00, 15.00))
        return (self.input_tokens * in_price + self.output_tokens * out_price) / 1_000_000


class LlmResponse(BaseModel):
    content: str
    tool_calls: list[dict[str, Any]] = []
    usage: LlmUsage
    stop_reason: str


class LlmClient:
    """Thin wrapper around the Anthropic SDK.

    All agents in CampaignOS MUST use this client — never call the Anthropic
    SDK directly, and NEVER use any other LLM provider (no OpenAI, no Gemini
    for text tasks). Gemini is only used for image generation via a separate
    image-generation service.
    """

    def __init__(self, model: str = "claude-haiku-4-5-20251001") -> None:
        if model not in ALLOWED_MODELS:
            raise ValueError(
                f"Model '{model}' is not allowed. CampaignOS only uses Anthropic models: "
                f"{sorted(ALLOWED_MODELS)}"
            )
        self.model = model
        api_key = os.environ.get("ANTHROPIC_API_KEY")
        if not api_key:
            raise EnvironmentError(
                "ANTHROPIC_API_KEY environment variable is required. "
                "Set AGENT_LLM_STUB=true to use stub mode without an API key."
            )
        self._client = anthropic.Anthropic(api_key=api_key)

    def complete(
        self,
        messages: list[Message],
        system: str | None = None,
        tools: list[ToolDefinition] | None = None,
        max_tokens: int = 4096,
        temperature: float = 0.0,
    ) -> LlmResponse:
        kwargs: dict[str, Any] = {
            "model": self.model,
            "messages": [m.model_dump() for m in messages],
            "max_tokens": max_tokens,
        }
        if system:
            kwargs["system"] = system
        if tools:
            kwargs["tools"] = [
                {
                    "name": t.name,
                    "description": t.description,
                    "input_schema": t.input_schema,
                }
                for t in tools
            ]

        response = self._client.messages.create(**kwargs)

        content_text = ""
        tool_calls: list[dict[str, Any]] = []
        for block in response.content:
            if block.type == "text":
                content_text += block.text
            elif block.type == "tool_use":
                tool_calls.append({"name": block.name, "input": block.input, "id": block.id})

        return LlmResponse(
            content=content_text,
            tool_calls=tool_calls,
            usage=LlmUsage(
                input_tokens=response.usage.input_tokens,
                output_tokens=response.usage.output_tokens,
            ),
            stop_reason=response.stop_reason or "end_turn",
        )
