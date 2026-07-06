"""Tool registry — manages Anthropic tool definitions used by agents.

Each agent declares its tools using the @tool decorator, which registers them
in a per-agent registry. The LlmClient receives the registry's tool_definitions()
list on each completion call.
"""
from __future__ import annotations

import inspect
from functools import wraps
from typing import Any, Callable, get_type_hints

from pydantic import BaseModel

from ..llm.client import ToolDefinition


def _python_type_to_json_schema(annotation: Any) -> dict[str, Any]:
    """Minimal Python type → JSON Schema converter for tool input schemas."""
    import typing

    origin = getattr(annotation, "__origin__", None)
    args = getattr(annotation, "__args__", ())

    if annotation is str:
        return {"type": "string"}
    if annotation is int:
        return {"type": "integer"}
    if annotation is float:
        return {"type": "number"}
    if annotation is bool:
        return {"type": "boolean"}
    if annotation is type(None):
        return {"type": "null"}
    if origin is list or origin is typing.List:  # noqa: UP006
        items = _python_type_to_json_schema(args[0]) if args else {}
        return {"type": "array", "items": items}
    if origin is dict or origin is typing.Dict:  # noqa: UP006
        return {"type": "object"}
    if inspect.isclass(annotation) and issubclass(annotation, BaseModel):
        return annotation.model_json_schema()
    return {"type": "string"}


class ToolRegistry:
    """Registry of tool definitions available to an agent."""

    def __init__(self) -> None:
        self._tools: dict[str, tuple[ToolDefinition, Callable[..., Any]]] = {}

    def register(
        self,
        name: str,
        description: str,
        fn: Callable[..., Any],
    ) -> None:
        sig = inspect.signature(fn)
        hints = get_type_hints(fn)
        properties: dict[str, Any] = {}
        required: list[str] = []

        for param_name, param in sig.parameters.items():
            if param_name in ("self", "cls"):
                continue
            annotation = hints.get(param_name, str)
            prop_schema = _python_type_to_json_schema(annotation)
            if hasattr(annotation, "__metadata__"):
                # typing.Annotated — extract description from metadata
                meta = annotation.__metadata__
                if meta:
                    prop_schema["description"] = str(meta[0])
            properties[param_name] = prop_schema
            if param.default is inspect.Parameter.empty:
                required.append(param_name)

        tool_def = ToolDefinition(
            name=name,
            description=description,
            input_schema={
                "type": "object",
                "properties": properties,
                "required": required,
            },
        )
        self._tools[name] = (tool_def, fn)

    def tool_definitions(self) -> list[ToolDefinition]:
        return [td for td, _ in self._tools.values()]

    def dispatch(self, name: str, input_data: dict[str, Any]) -> Any:
        if name not in self._tools:
            raise KeyError(f"Unknown tool: {name!r}. Registered: {list(self._tools)}")
        _, fn = self._tools[name]
        return fn(**input_data)

    def __contains__(self, name: str) -> bool:
        return name in self._tools


_GLOBAL_REGISTRY: dict[str, ToolRegistry] = {}


def tool(
    name: str | None = None,
    description: str = "",
    registry: ToolRegistry | None = None,
) -> Callable[[Callable[..., Any]], Callable[..., Any]]:
    """Decorator to register a function as an agent tool."""

    def decorator(fn: Callable[..., Any]) -> Callable[..., Any]:
        tool_name = name or fn.__name__
        tool_description = description or (fn.__doc__ or "").strip()
        reg = registry or ToolRegistry()
        reg.register(tool_name, tool_description, fn)

        @wraps(fn)
        def wrapper(*args: Any, **kwargs: Any) -> Any:
            return fn(*args, **kwargs)

        wrapper._tool_name = tool_name  # type: ignore[attr-defined]
        wrapper._tool_registry = reg  # type: ignore[attr-defined]
        return wrapper

    return decorator
