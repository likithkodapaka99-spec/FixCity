"""
Community tables — used in STEP 7; created now so we only migrate once (STEP 3).

- VolunteerOffer: “I can help” on a report
- UrgencyVote: one urgency score per anonymous voter per report (for heatmap / sorting)
- ReportMessage: simple thread under a report (chat/contact)
"""
from __future__ import annotations

from datetime import datetime, timezone

from app.extensions import db


def _utc_now():
    return datetime.now(timezone.utc)


class VolunteerOffer(db.Model):
    __tablename__ = "volunteer_offers"

    id = db.Column(db.Integer, primary_key=True)
    report_id = db.Column(
        db.Integer,
        db.ForeignKey("reports.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    display_name = db.Column(db.String(120), nullable=False)
    contact = db.Column(db.String(255), nullable=True)
    created_at = db.Column(db.DateTime(timezone=True), nullable=False, default=_utc_now)

    report = db.relationship("Report", back_populates="volunteers")


class UrgencyVote(db.Model):
    __tablename__ = "urgency_votes"
    __table_args__ = (
        db.UniqueConstraint("report_id", "voter_key", name="uq_urgency_vote_per_voter"),
    )

    id = db.Column(db.Integer, primary_key=True)
    report_id = db.Column(
        db.Integer,
        db.ForeignKey("reports.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    # Demo “user id” from frontend (random UUID in localStorage is enough)
    voter_key = db.Column(db.String(64), nullable=False)
    # 1 = low urgency … 5 = critical (adjust in STEP 7 UX)
    score = db.Column(db.Integer, nullable=False)

    created_at = db.Column(db.DateTime(timezone=True), nullable=False, default=_utc_now)

    report = db.relationship("Report", back_populates="urgency_votes")


class ReportMessage(db.Model):
    __tablename__ = "report_messages"

    id = db.Column(db.Integer, primary_key=True)
    report_id = db.Column(
        db.Integer,
        db.ForeignKey("reports.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    sender_name = db.Column(db.String(120), nullable=False)
    body = db.Column(db.Text, nullable=False)
    created_at = db.Column(db.DateTime(timezone=True), nullable=False, default=_utc_now)

    report = db.relationship("Report", back_populates="messages")
