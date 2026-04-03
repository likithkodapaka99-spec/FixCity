"""
Database access for reports (STEP 3).

Uses SQLite via SQLAlchemy. `unique_upload_name` stays file-system only.
"""
from __future__ import annotations

import uuid
from typing import Any

from sqlalchemy import delete, select
from sqlalchemy.orm import joinedload

from app.extensions import db
from app.geo import haversine_km
from app.models import Report
from app.services.classify import classify_issue


def unique_upload_name(original: str) -> str:
    """Avoid collisions; keep a hint of the original extension."""
    ext = ""
    if "." in original:
        ext = "." + original.rsplit(".", 1)[-1].lower()
    return f"{uuid.uuid4().hex}{ext}"


def create_report(
    *,
    description: str,
    latitude: float | None,
    longitude: float | None,
    image_filename: str | None,
    user_id: int | None = None,
) -> dict[str, Any]:
    row = Report(
        user_id=user_id,
        description=description.strip(),
        latitude=latitude,
        longitude=longitude,
        image_filename=image_filename,
    )
    db.session.add(row)
    db.session.flush()

    ai = classify_issue(description)
    row.issue_category = ai["issue_category"]
    row.priority = ai["priority"]
    row.resolution_route = ai["resolution_route"]
    row.ai_suggestions = ai["ai_suggestions"]

    db.session.commit()
    return row.to_public_dict()


def get_report(report_id: int) -> dict[str, Any] | None:
    row = db.session.scalar(
        select(Report)
        .options(joinedload(Report.author))
        .where(Report.id == report_id)
    )
    return row.to_public_dict() if row else None


def list_reports(
    *,
    near_lat: float | None = None,
    near_lng: float | None = None,
    radius_km: float | None = None,
) -> list[dict[str, Any]]:
    stmt = (
        select(Report)
        .options(joinedload(Report.author))
        .order_by(Report.id.desc())
    )
    rows = list(db.session.scalars(stmt).unique().all())
    if near_lat is not None and near_lng is not None and radius_km is not None:
        rows = [
            r
            for r in rows
            if r.latitude is not None
            and r.longitude is not None
            and haversine_km(near_lat, near_lng, float(r.latitude), float(r.longitude))
            <= radius_km
        ]
    return [r.to_public_dict() for r in rows]


def delete_all_reports() -> None:
    """Wipe reports (cascades volunteers, votes, messages). For demos/tests only."""
    db.session.execute(delete(Report))
    db.session.commit()
