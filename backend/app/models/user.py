"""Registered accounts — signup / login with password hashes (Werkzeug)."""
from __future__ import annotations

from datetime import datetime, timezone

from app.extensions import db


def _utc_now():
    return datetime.now(timezone.utc)


class User(db.Model):
    __tablename__ = "users"

    id = db.Column(db.Integer, primary_key=True)
    display_name = db.Column(db.String(120), nullable=False)
    email = db.Column(db.String(255), nullable=False, unique=True, index=True)
    password_hash = db.Column(db.String(256), nullable=False)
    created_at = db.Column(
        db.DateTime(timezone=True),
        nullable=False,
        default=_utc_now,
    )

    reports = db.relationship("Report", back_populates="author")

    def to_public_dict(self) -> dict:
        return {
            "id": self.id,
            "display_name": self.display_name,
            "email": self.email,
        }
