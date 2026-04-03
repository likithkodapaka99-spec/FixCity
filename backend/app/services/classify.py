"""
STEP 6 — Rule-based “AI” triage (no API key required).

Classifies text reports into a category, priority, resolution path, and a list of
at least two actionable suggestions (DIY, safety, services, community/authority).

Optional env: OPENAI_API_KEY — if set, you could swap this module later for LLM calls.
For the hackathon demo we stay fast and deterministic.
"""
from __future__ import annotations

import re
from typing import Any

# Keywords grouped by domain (extend freely for your demo script).
_GARBAGE = (
    "garbage",
    "trash",
    "rubbish",
    "litter",
    "dump",
    "waste",
    "debris",
    "rotting",
    "filth",
    "stench",
)
_ROAD = (
    "pothole",
    "potholes",
    "crater",
    "road",
    "asphalt",
    "street damage",
    "broken road",
    "sinkhole",
    "tarmac",
)
_WATER = (
    "water leak",
    "leak",
    "leaking",
    "pipe",
    "burst pipe",
    "flooding",
    "flood",
    "sewage",
    "sewer",
    "tap",
    "faucet",
    "drain",
)
_ELECTRICAL = (
    "electric",
    "electrical",
    "wire",
    "wires",
    "streetlight",
    "street light",
    "lamp post",
    "power line",
    "transformer",
    "spark",
    "shock",
)

_HIGH_SIGNALS = (
    "urgent",
    "danger",
    "hazard",
    "injured",
    "accident",
    "expose",
    "sparking",
    "live wire",
    "burst",
    "gushing",
    "deep hole",
)


def _normalize(text: str) -> str:
    t = text.lower().strip()
    t = re.sub(r"\s+", " ", t)
    return t


def _mentions_any(haystack: str, needles: tuple[str, ...]) -> bool:
    return any(n in haystack for n in needles)


def _bump_priority(base: str, text: str) -> str:
    if _mentions_any(text, _HIGH_SIGNALS):
        return "high"
    return base


def classify_issue(description: str) -> dict[str, Any]:
    """
    Return keys aligned with Report columns:
    issue_category, priority, resolution_route, ai_suggestions (list[str], len >= 2).
    """
    text = _normalize(description)
    suggestions: list[str] = []

    # Defaults
    category = "general"
    base_pri = "medium"
    resolution = "community"

    # --- Garbage / sanitation → community + NGO angle (hackathon rule)
    if _mentions_any(text, _GARBAGE):
        category = "garbage"
        base_pri = "medium"
        resolution = "community"
        suggestions.extend(
            [
                "Community: contact a local NGO or resident welfare association "
                "to organize a cleanup drive and safe waste sorting.",
                "DIY / temporary: if safe, cordon the area with tape or cones so "
                "pedestrians avoid sharp or medical waste; never touch needles bare-handed.",
                "Nearby service: search maps for “municipal solid waste” or sanitation helpline; "
                "share photos + GPS pin for faster pickup.",
                "Safety: wear gloves and a mask if you must move small bagged waste; "
                "wash hands thoroughly afterward.",
            ]
        )

    # --- Road / potholes → authority (hackathon rule)
    elif _mentions_any(text, _ROAD):
        category = "road"
        base_pri = _bump_priority("medium", text)
        resolution = "authority"
        suggestions.extend(
            [
                "Authority: potholes are usually handled by the roads department / "
                "municipality — your report is flagged for official repair scheduling.",
                "Safety: if directing traffic isn’t safe, stay off the carriageway; "
                "avoid sudden swerves — slow down and signal early.",
                "DIY / temporary: bright reflective tape or a traffic cone (only if legal/safe) "
                "can warn two-wheelers until crews arrive.",
                "Nearby service: for private driveways, search “asphalt patch” / road contractors; "
                "public streets still need authority work orders.",
            ]
        )

    # --- Water → plumber + temporary fix (hackathon rule)
    elif _mentions_any(text, _WATER):
        category = "water"
        base_pri = _bump_priority("medium", text)
        resolution = "community"
        suggestions.extend(
            [
                "DIY / temporary: if indoors and safe, shut the main water valve to reduce damage; "
                "soak water with towels/mops and ventilate to limit mold risk.",
                "Nearby service: call a licensed plumber for pipe bursts; for public mains leaks, "
                "also notify the water utility / municipal water wing with this pin.",
                "Safety: don’t touch electrical switches or appliances standing in water; "
                "keep kids and pets away from slippery or contaminated pools.",
                "Community: ask security / neighbors to help watch the spot and redirect foot traffic.",
            ]
        )

    # --- Electrical / streetlights
    elif _mentions_any(text, _ELECTRICAL):
        category = "electrical"
        base_pri = _bump_priority("medium", text)
        resolution = "authority"
        suggestions.extend(
            [
                "Safety: assume downed lines are live — stay at least 10 m away, keep others clear, "
                "and don’t touch metal fences or wet ground leading to the hazard.",
                "Authority: report to the power utility emergency hotline and municipal lighting "
                "cell; streetlight outages often need authorized bucket crews.",
                "DIY / temporary: only safe action is cordoning and signage — no DIY wiring on poles.",
                "Nearby service: licensed electrician for building circuits; public infrastructure "
                "must be handled by utilities.",
            ]
        )

    # --- Fallback “general neighborhood issue”
    else:
        category = "general"
        base_pri = "medium"
        resolution = "community"
        suggestions.extend(
            [
                "Community: share this report in local groups so residents can confirm, help, "
                "or document the issue with photos (respect privacy).",
                "Authority: if it involves traffic safety, utilities, or environmental harm, "
                "escalate via the municipal complaint portal with this GPS.",
                "Safety: don’t block emergency routes when gathering evidence; "
                "keep a safe distance from moving traffic or unstable structures.",
            ]
        )

    # Guarantee at least two lines (defensive — rules above already exceed this).
    generic = [
        "Pin accuracy matters: recheck GPS on the map and add landmarks in the description.",
        "Follow-up: after 48 hours, add a comment or fresh photo so volunteers see progress.",
    ]
    out: list[str] = []
    seen: set[str] = set()
    for s in suggestions + generic:
        s = s.strip()
        if not s or s in seen:
            continue
        seen.add(s)
        out.append(s)
        if len(out) >= 6:
            break
    while len(out) < 2:
        out.append(
            "Document the issue: wide shot + close-up helps triage teams respond faster."
        )

    priority = _bump_priority(base_pri, text)

    return {
        "issue_category": category,
        "priority": priority,
        "resolution_route": resolution,
        "ai_suggestions": out[:8],
    }
