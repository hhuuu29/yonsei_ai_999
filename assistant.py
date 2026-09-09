"""A minimal, deterministic, offline rule-based assistant.

The goal is to provide something genuinely interactive that can be exercised
end to end without any external services. Each public behavior is small and
unit-testable.
"""

from __future__ import annotations

import ast
import operator
import re
from dataclasses import dataclass


@dataclass
class Reply:
    text: str
    intent: str


# Supported operators for the safe arithmetic evaluator.
_ALLOWED_OPERATORS = {
    ast.Add: operator.add,
    ast.Sub: operator.sub,
    ast.Mult: operator.mul,
    ast.Div: operator.truediv,
    ast.Pow: operator.pow,
    ast.Mod: operator.mod,
    ast.USub: operator.neg,
    ast.UAdd: operator.pos,
}


def _safe_eval(node: ast.AST) -> float:
    if isinstance(node, ast.Expression):
        return _safe_eval(node.body)
    if isinstance(node, ast.Constant):
        if isinstance(node.value, (int, float)):
            return node.value
        raise ValueError("unsupported constant")
    if isinstance(node, ast.BinOp) and type(node.op) in _ALLOWED_OPERATORS:
        return _ALLOWED_OPERATORS[type(node.op)](
            _safe_eval(node.left), _safe_eval(node.right)
        )
    if isinstance(node, ast.UnaryOp) and type(node.op) in _ALLOWED_OPERATORS:
        return _ALLOWED_OPERATORS[type(node.op)](_safe_eval(node.operand))
    raise ValueError("unsupported expression")


class Assistant:
    """Routes a user message to a small set of deterministic intents."""

    def reply(self, message: str) -> Reply:
        text = message.strip()
        lowered = text.lower()

        if self._is_greeting(lowered):
            return Reply(
                "Hello! I'm Yonsei AI 999, a tiny offline assistant. "
                "Try: 'reverse hello', 'count words in ...', or '2 * (3 + 4)'.",
                "greeting",
            )

        if lowered.startswith("reverse "):
            return Reply(text[len("reverse "):][::-1], "reverse")

        count_match = re.match(r"count words(?: in)?\s+(.*)", lowered, re.DOTALL)
        if count_match:
            words = count_match.group(1).split()
            return Reply(f"That has {len(words)} word(s).", "word_count")

        math_result = self._try_math(text)
        if math_result is not None:
            return Reply(math_result, "math")

        if "help" in lowered:
            return Reply(
                "I can: greet you, 'reverse <text>', 'count words in <text>', "
                "and evaluate arithmetic like '12 * (3 + 1)'.",
                "help",
            )

        return Reply(f"You said: {text}", "echo")

    @staticmethod
    def _is_greeting(lowered: str) -> bool:
        return any(
            lowered == g or lowered.startswith(g + " ")
            for g in ("hi", "hello", "hey", "안녕", "안녕하세요")
        )

    @staticmethod
    def _try_math(text: str) -> str | None:
        # Only attempt arithmetic when the string looks like a math expression.
        if not re.fullmatch(r"[0-9\.\s\+\-\*\/\%\(\)\^]+", text):
            return None
        expr = text.replace("^", "**")
        try:
            value = _safe_eval(ast.parse(expr, mode="eval"))
        except (ValueError, SyntaxError, ZeroDivisionError):
            return None
        if isinstance(value, float) and value.is_integer():
            value = int(value)
        return f"= {value}"
