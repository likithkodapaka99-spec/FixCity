"""
Core report row — user-submitted local problems (STEP 3).

`issue_category`, `priority`, `resolution_route`, and `ai_suggestions` are
filled on create by the rule-based triage module (STEP 6).
"""
from __future__ import annotations

from datetime import datetime, timezone

from app.extensions import db


def _utc_now():
    return datetime.now(timezone.utc)


class Report(db.Model):
    __tablename__ = "reports"

    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(
        db.Integer,
        db.ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    description = db.Column(db.Text, nullable=False)
    latitude = db.Column(db.Float, nullable=True)
    longitude = db.Column(db.Float, nullable=True)
    # Stored file name under backend/uploads (not a full URL)
    image_filename = db.Column(db.String(255), nullable=True)

    created_at = db.Column(
        db.DateTime(timezone=True),
        nullable=False,
        default=_utc_now,
    )
    authority_status = db.Column(
        db.String(64),
        nullable=False,
        default="Sent to Municipality",
    )

    # --- STEP 6: AI classification (nullable until analyzed) ---
    issue_category = db.Column(db.String(64), nullable=True)
    priority = db.Column(db.String(16), nullable=True)
    resolution_route = db.Column(db.String(32), nullable=True)
    ai_suggestions = db.Column(db.JSON, nullable=True)

    volunteers = db.relationship(
        "VolunteerOffer",
        back_populates="report",
        cascade="all, delete-orphan",
    )
    urgency_votes = db.relationship(
        "UrgencyVote",
        back_populates="report",
        cascade="all, delete-orphan",
    )
    messages = db.relationship(
        "ReportMessage",
        back_populates="report",
        cascade="all, delete-orphan",
    )
    author = db.relationship("User", back_populates="reports")

    def to_public_dict(self) -> dict:
        """Same JSON shape the frontend / STEP 2 API already expects, plus optional AI keys."""
        ts = self.created_at
        if ts.tzinfo is None:
            ts = ts.replace(tzinfo=timezone.utc)
        author = None
        if self.author:
            author = {"display_name": self.author.display_name}
        return {
            "id": self.id,
            "author": author,
            "description": self.description,
            "latitude": self.latitude,
            "longitude": self.longitude,
            "image_url": f"/uploads/{self.image_filename}" if self.image_filename else None,
            "created_at": ts.isoformat(),
            "authority_status": self.authority_status,
            "issue_category": self.issue_category,
            "priority": self.priority,
            "resolution_route": self.resolution_route,
            "ai_suggestions": self.ai_suggestions,
        }
