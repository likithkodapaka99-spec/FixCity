"""Municipality console API — staff-only; manual status updates and deletions."""
from __future__ import annotations

import os
import time
from typing import Any

from flask import Blueprint, current_app, jsonify, request, session
from sqlalchemy import select
from sqlalchemy.orm import joinedload

from app.extensions import db
from app.models import Report, User

bp = Blueprint("authority", __name__)

STATUS_PIPELINE: tuple[str, ...] = (
    "Sent to Municipality",
    "In Progress",
    "Resolved",
)

ALLOWED_STATUSES: frozenset[str] = frozenset(STATUS_PIPELINE)


def _staff_user() -> User | None:
    uid = session.get("user_id")
    if not uid:
        return None
    user = db.session.get(User, int(uid))
    if not user or getattr(user, "role", "citizen") != "authority":
        return None
    return user


def _require_staff() -> tuple[User | None, Any]:
    u = _staff_user()
    if not u:
        return None, (jsonify({"error": "unauthorized", "login_url": "/authority/login"}), 401)
    return u, None


@bp.get("/api/authority/dashboard")
def dashboard():
    err = _require_staff()
    if err[1]:
        return err[1]
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
        }
    )


@bp.patch("/api/authority/reports/<int:report_id>")
def patch_report_status(report_id: int):
    err = _require_staff()
    if err[1]:
        return err[1]

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


@bp.delete("/api/authority/reports/<int:report_id>")
def delete_report(report_id: int):
    err = _require_staff()
    if err[1]:
        return err[1]

    row = db.session.get(Report, report_id)
    if row is None:
        return jsonify({"error": "not found"}), 404

    if row.image_filename:
        folder = current_app.config["UPLOAD_FOLDER"]
        path = os.path.join(folder, row.image_filename)
        if os.path.isfile(path):
            try:
                os.remove(path)
            except OSError:
                pass

    db.session.delete(row)
    db.session.commit()
    return jsonify({"ok": True, "deleted_id": report_id})
