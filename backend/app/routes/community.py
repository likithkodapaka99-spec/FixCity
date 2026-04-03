"""
STEP 7 — Community: volunteers (“I can help”), urgency votes, lightweight chat.

All JSON bodies use Content-Type: application/json.
"""
from __future__ import annotations

from datetime import datetime, timezone

from flask import Blueprint, jsonify, request
from sqlalchemy import select

from app.extensions import db
from app.models import Report, ReportMessage, UrgencyVote, VolunteerOffer

bp = Blueprint("community", __name__)


def _iso(dt: datetime) -> str:
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt.isoformat()


def _require_report(report_id: int) -> Report | None:
    return db.session.get(Report, report_id)


@bp.get("/api/reports/<int:report_id>/community")
def community_bundle(report_id: int):
    """Volunteers, vote rollup, and recent messages. Optional `voter_key` highlights your vote."""
    if _require_report(report_id) is None:
        return jsonify({"error": "not found"}), 404

    voter_key = (request.args.get("voter_key") or "").strip()[:64]

    volunteers = db.session.scalars(
        select(VolunteerOffer)
        .where(VolunteerOffer.report_id == report_id)
        .order_by(VolunteerOffer.created_at.desc())
    ).all()

    votes = db.session.scalars(
        select(UrgencyVote).where(UrgencyVote.report_id == report_id)
    ).all()
    n = len(votes)
    avg = round(sum(v.score for v in votes) / n, 2) if n else None
    my_score = next((v.score for v in votes if voter_key and v.voter_key == voter_key), None)

    messages = db.session.scalars(
        select(ReportMessage)
        .where(ReportMessage.report_id == report_id)
        .order_by(ReportMessage.created_at.asc())
        .limit(80)
    ).all()

    return jsonify(
        {
            "report_id": report_id,
            "volunteers": [
                {
                    "id": v.id,
                    "display_name": v.display_name,
                    "contact": v.contact,
                    "created_at": _iso(v.created_at),
                }
                for v in volunteers
            ],
            "vote_summary": {"count": n, "average": avg, "my_score": my_score},
            "messages": [
                {
                    "id": m.id,
                    "sender_name": m.sender_name,
                    "body": m.body,
                    "created_at": _iso(m.created_at),
                }
                for m in messages
            ],
        }
    )


@bp.post("/api/reports/<int:report_id>/volunteers")
def add_volunteer(report_id: int):
    if _require_report(report_id) is None:
        return jsonify({"error": "not found"}), 404

    payload = request.get_json(silent=True) or {}
    name = (payload.get("display_name") or "").strip()
    if not name:
        return jsonify({"error": "display_name is required"}), 400
    contact = (payload.get("contact") or "").strip() or None
    if contact and len(contact) > 255:
        return jsonify({"error": "contact too long"}), 400

    v = VolunteerOffer(report_id=report_id, display_name=name[:120], contact=contact)
    db.session.add(v)
    db.session.commit()
    return jsonify({"ok": True, "id": v.id}), 201


@bp.post("/api/reports/<int:report_id>/votes")
def cast_vote(report_id: int):
    """Upsert one urgency score (1–5) per (report, voter_key)."""
    if _require_report(report_id) is None:
        return jsonify({"error": "not found"}), 404

    payload = request.get_json(silent=True) or {}
    voter_key = (payload.get("voter_key") or "").strip()[:64]
    if not voter_key:
        return jsonify({"error": "voter_key is required"}), 400
    score = payload.get("score")
    try:
        score_int = int(score)
    except (TypeError, ValueError):
        return jsonify({"error": "score must be an integer"}), 400
    if score_int < 1 or score_int > 5:
        return jsonify({"error": "score must be between 1 and 5"}), 400

    existing = db.session.scalar(
        select(UrgencyVote).where(
            UrgencyVote.report_id == report_id,
            UrgencyVote.voter_key == voter_key,
        )
    )
    if existing:
        existing.score = score_int
    else:
        db.session.add(
            UrgencyVote(report_id=report_id, voter_key=voter_key, score=score_int)
        )
    db.session.commit()
    return jsonify({"ok": True, "score": score_int}), 201


@bp.post("/api/reports/<int:report_id>/messages")
def post_message(report_id: int):
    if _require_report(report_id) is None:
        return jsonify({"error": "not found"}), 404

    payload = request.get_json(silent=True) or {}
    sender = (payload.get("sender_name") or "").strip()
    body = (payload.get("body") or "").strip()
    if not sender:
        return jsonify({"error": "sender_name is required"}), 400
    if not body:
        return jsonify({"error": "body is required"}), 400
    if len(sender) > 120:
        return jsonify({"error": "sender_name too long"}), 400
    if len(body) > 2000:
        return jsonify({"error": "body too long"}), 400

    m = ReportMessage(
        report_id=report_id,
        sender_name=sender[:120],
        body=body,
    )
    db.session.add(m)
    db.session.commit()
    return jsonify({"ok": True, "id": m.id}), 201
