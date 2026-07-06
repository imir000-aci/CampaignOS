"""Unit tests for output validation utilities."""
import pytest
from pydantic import BaseModel

from agent_base.validation.output import (
    SchemaValidationError,
    _extract_json,
    validate_output,
)


class SampleOutput(BaseModel):
    title: str
    score: float
    tags: list[str]


class TestExtractJson:
    def test_bare_json_object(self) -> None:
        text = '{"key": "value"}'
        assert _extract_json(text) == '{"key": "value"}'

    def test_json_in_markdown_fence(self) -> None:
        text = '```json\n{"key": "value"}\n```'
        result = _extract_json(text)
        assert '"key"' in result

    def test_json_wrapped_in_prose(self) -> None:
        text = 'Here is the output:\n{"title": "test", "score": 4.5, "tags": []}'
        result = _extract_json(text)
        assert '"title"' in result

    def test_raises_on_no_json(self) -> None:
        with pytest.raises(ValueError, match="No JSON"):
            _extract_json("This is plain text with no JSON at all.")


class TestValidateOutput:
    def test_valid_output(self) -> None:
        raw = '{"title": "Campaign Brief", "score": 4.2, "tags": ["retail", "seasonal"]}'
        result = validate_output(raw, SampleOutput)
        assert result.title == "Campaign Brief"
        assert result.score == 4.2
        assert result.tags == ["retail", "seasonal"]

    def test_invalid_schema_raises(self) -> None:
        raw = '{"title": "test"}'  # missing required fields
        with pytest.raises(SchemaValidationError) as exc_info:
            validate_output(raw, SampleOutput)
        assert exc_info.value.errors

    def test_invalid_json_raises(self) -> None:
        raw = "this is not json"
        with pytest.raises(SchemaValidationError):
            validate_output(raw, SampleOutput)

    def test_json_in_prose_with_valid_schema(self) -> None:
        raw = 'The agent output is: {"title": "test", "score": 3.0, "tags": []}'
        result = validate_output(raw, SampleOutput)
        assert result.title == "test"
