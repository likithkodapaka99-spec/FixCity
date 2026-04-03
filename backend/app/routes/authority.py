"""
STEP 8 — Fake “municipality” console: status pipeline + demo advances.

No external APIs. Safe for hackathon storytelling + auto-refresh in the UI.
"""
from __future__ import annotations

import random
import time
from typing import Any

from flask import Blueprint, jsonify, request
from sqlalchemy import select
from sqlalchemy.orm import joinedload

from app.extensions import db
from app.models import Report

bp = Blueprint("authority", __name__)

# Ticket lifecycle shown in the demo dashboard
STATUS_PIPELINE: tuple[str, ...] = (
    "Sent to Municipality",
    "In Progress",
    "Resolved",
)

ALLOWED_STATUSES: frozenset[str] = frozenset(STATUS_PIPELINE)


def _normalize_status(value: str) -> str:
    if value in ALLOWED_STATUSES:
        return value
    return STATUS_PIPELINE[0]


def _next_status(current: str) -> str | None:
    cur = _normalize_status(current)
    idx = STATUS_PIPELINE.index(cur)
    if idx >= len(STATUS_PIPELINE) - 1:
        return None
    return STATUS_PIPELINE[idx + 1]


def _fake_pulse_message() -> str:
    tick = int(time.time()) // 12
    messages = [
        "Municipality data link: simulated ✓",
        "Dispatch queue refreshed (demo clock)",
        "Crew roster: placeholder — morale high",
        "GIS sync: not configured (expected for hackathon)",
    ]
    return messages[tick % len(messages)]


@bp.get("/api/authority/dashboard")
def dashboard():
    """Aggregated ticket counts + full report list for the ops view."""
    stmt = (
        select(Report)
        .options(joinedload(Report.author))
        .order_by(Report.id.desc())
    )
    rows = list(db.session.scalars(stmt).unique().all())
    stats: dict[str, int] = {}
    for r in rows:
        stats[r.authority_status] = stats.get(r.authority_status, 0) + 1

    return jsonify(
        {
            "generated_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
            "stats": stats,
            "pipeline": list(STATUS_PIPELINE),
            "reports": [r.to_public_dict() for r in rows],
            "fake_pulse": {
                "message": _fake_pulse_message(),
                "latency_ms": random.randint(28, 160),
            },
        }
    )


@bp.post("/api/authority/simulate")
def simulate_tick():
    """
    Advance one open ticket one step along the pipeline (demo “time moving”).

    JSON body optional: { "report_id": 12 } — if omitted, picks a random non-resolved row.
    """
    payload = request.get_json(silent=True) or {}
    rid = payload.get("report_id")
    row: Report | None

    if rid is not None:
        try:
            rid_int = int(rid)
        except (TypeError, ValueError):
            return jsonify({"error": "report_id must be an integer"}), 400
        row = db.session.get(Report, rid_int)
        if row is None:
            return jsonify({"error": "report not found"}), 404
    else:
        open_rows = db.session.scalars(
            select(Report).where(Report.authority_status != STATUS_PIPELINE[-1])
        ).all()
        open_list = list(open_rows)
        if not open_list:
            return jsonify({"ok": True, "message": "Nothing to advance — all resolved."})
        row = random.choice(open_list)

    nxt = _next_status(row.authority_status)
    if nxt is None:
        return jsonify(
            {
                "ok": True,
                "message": f"Report #{row.id} is already at terminal status.",
                "report": row.to_public_dict(),
            }
        )

    row.authority_status = nxt
    db.session.commit()
    return jsonify(
        {
            "ok": True,
            "message": f'Report #{row.id} moved to "{nxt}" (simulation).',
            "report": row.to_public_dict(),
        }
    )


@bp.patch("/api/authority/reports/<int:report_id>")
def patch_report_status(report_id: int):
    """Manual override for judges / presenters: { "authority_status": "In Progress" }"""
    row = db.session.get(Report, report_id)
    if row is None:
        return jsonify({"error": "not found"}), 404

    payload = request.get_json(silent=True) or {}
    status = (payload.get("authority_status") or "").strip()
    if not status:
        return jsonify({"error": "authority_status is required"}), 400
    if status not in ALLOWED_STATUSES:
        return jsonify(
            {
                "error": "invalid status",
                "allowed": list(STATUS_PIPELINE),
            }
        ), 400

    row.authority_status = status
    db.session.commit()
    return jsonify({"ok": True, "report": row.to_public_dict()})
