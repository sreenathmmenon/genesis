"""Unit tests for the intent Router's normalization logic.

These test the pure decision-shaping (_normalize / _fallback) without any LLM
call, so they run fast and deterministically.
"""
from __future__ import annotations

from genesis.agents.router import RouterAgent, _CONFIDENCE_FLOOR


def _router() -> RouterAgent:
    return RouterAgent()


def test_valid_high_confidence_lane_passes_through():
    r = _router()
    out = r._normalize(
        {
            "lane": "ANSWER",
            "confidence": 0.95,
            "reasoning": "one-shot essay",
            "params": {"needs_live_data": False, "is_recurring": False},
        },
        intent="write an essay",
    )
    assert out["lane"] == "ANSWER"
    assert out["confidence"] == 0.95
    assert out["params"]["is_recurring"] is False


def test_automate_lane_recognized():
    r = _router()
    out = r._normalize(
        {"lane": "AUTOMATE", "confidence": 0.9, "params": {"is_recurring": True}},
        intent="every morning send me news",
    )
    assert out["lane"] == "AUTOMATE"
    assert out["params"]["is_recurring"] is True


def test_low_confidence_is_forced_to_clarify():
    r = _router()
    out = r._normalize(
        {
            "lane": "ANSWER",
            "confidence": _CONFIDENCE_FLOOR - 0.1,
            "params": {"suggested_clarifying_question": "Once or recurring?"},
        },
        intent="do the thing",
    )
    assert out["lane"] == "CLARIFY"
    assert out["params"]["suggested_clarifying_question"]


def test_unknown_lane_falls_back_to_clarify():
    r = _router()
    out = r._normalize({"lane": "BANANA", "confidence": 0.99}, intent="???")
    assert out["lane"] == "CLARIFY"
    assert out["confidence"] == 0.0


def test_clarify_lane_below_floor_stays_clarify_not_recursed():
    r = _router()
    out = r._normalize(
        {"lane": "CLARIFY", "confidence": 0.2, "params": {"suggested_clarifying_question": "What?"}},
        intent="hmm",
    )
    assert out["lane"] == "CLARIFY"


def test_confidence_clamped_to_unit_interval():
    r = _router()
    out = r._normalize({"lane": "ANSWER", "confidence": 5.0}, intent="x")
    assert 0.0 <= out["confidence"] <= 1.0


def test_garbage_confidence_defaults_to_zero_then_clarify():
    r = _router()
    out = r._normalize({"lane": "RETRIEVE", "confidence": "not-a-number"}, intent="x")
    # confidence parses to 0.0 → below floor → CLARIFY
    assert out["lane"] == "CLARIFY"


def test_fallback_shape_is_complete():
    out = RouterAgent._fallback("anything")
    assert out["lane"] == "CLARIFY"
    assert out["confidence"] == 0.0
    assert "suggested_clarifying_question" in out["params"]
    assert out["params"]["suggested_clarifying_question"]


def test_missing_params_handled():
    r = _router()
    out = r._normalize({"lane": "ANSWER", "confidence": 0.9}, intent="write a poem")
    assert out["params"]["needs_live_data"] is False
    assert out["params"]["is_recurring"] is False
