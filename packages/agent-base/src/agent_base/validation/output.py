"""Structured output validation — ensures LLM responses conform to Pydantic schemas."""
from __future__ import annotations

import json
import re
from typing import Any, TypeVar

from pydantic import BaseModel, ValidationError

T = TypeVar("T", bound=BaseModel)


class SchemaValidationError(Exception):
    def __init__(self, message: str, raw_content: str, errors: list[dict[str, Any]]) -> None:
        super().__init__(message)
        self.raw_content = raw_content
        self.errors = errors


def _extract_json(text: str) -> str:
    """Extract the first JSON object or array from a text string."""
    # Try direct parse first
    text = text.strip()
    try:
        json.loads(text)
        return text
    except json.JSONDecodeError:
        pass

    # Find JSON blocks in markdown code fences
    fence = re.search(r"```(?:json)?\s*(\{[\s\S]*?\}|\[[\s\S]*?\])\s*```", text)
    if fence:
        return fence.group(1)

    # Find first { or [ and try to extract from there
    for start_char, end_char in [("{", "}"), ("[", "]")]:
        start = text.find(start_char)
        if start == -1:
            continue
        # Find matching close using depth tracking
        depth = 0
        in_string = False
        escaped = False
        for i in range(start, len(text)):
            c = text[i]
            if escaped:
                escaped = False
                continue
            if c == "\\" and in_string:
                escaped = True
                continue
            if c == '"' and not escaped:
                in_string = not in_string
                continue
            if in_string:
                continue
            if c == start_char:
                depth += 1
            elif c == end_char:
                depth -= 1
                if depth == 0:
                    return text[start : i + 1]

    raise ValueError(f"No JSON found in: {text[:200]!r}")


def validate_output(
    raw_content: str,
    schema_class: type[T],
    max_attempts: int = 3,
) -> T:
    """Parse and validate LLM output against a Pydantic schema.

    Args:
        raw_content: Raw text from the LLM response.
        schema_class: Pydantic model class to validate against.
        max_attempts: Unused here (retry logic lives in the RCR loop), kept for API clarity.

    Returns:
        Validated instance of schema_class.

    Raises:
        SchemaValidationError: If parsing or validation fails.
    """
    try:
        json_str = _extract_json(raw_content)
        data = json.loads(json_str)
    except (ValueError, json.JSONDecodeError) as e:
        raise SchemaValidationError(
            f"Failed to extract JSON from LLM output: {e}",
            raw_content=raw_content,
            errors=[{"msg": str(e)}],
        ) from e

    try:
        return schema_class.model_validate(data)
    except ValidationError as e:
        raise SchemaValidationError(
            f"Schema validation failed for {schema_class.__name__}: {e}",
            raw_content=raw_content,
            errors=e.errors(),
        ) from e


def build_schema_error_prompt(error: SchemaValidationError, schema_class: type[BaseModel]) -> str:
    """Build a reprompt message asking the LLM to fix its output."""
    schema_json = json.dumps(schema_class.model_json_schema(), indent=2)
    errors_json = json.dumps(error.errors, indent=2)
    return (
        f"Your previous output was invalid. Errors:\n{errors_json}\n\n"
        f"Required JSON schema:\n```json\n{schema_json}\n```\n\n"
        "Please return ONLY a valid JSON object that matches this schema exactly. "
        "No prose, no markdown, just the JSON."
    )
