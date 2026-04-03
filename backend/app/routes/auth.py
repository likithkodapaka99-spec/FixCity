"""Signup, login (session cookie), and current-user endpoints."""
from __future__ import annotations

import re

from flask import Blueprint, jsonify, request, session
from sqlalchemy import select
from sqlalchemy.orm import joinedload
from werkzeug.security import check_password_hash, generate_password_hash

from app.extensions import db
from app.models import Report, User

bp = Blueprint("auth", __name__)

_EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")


@bp.post("/api/auth/signup")
def signup():
    data = request.get_json(silent=True) or {}
    name = (data.get("display_name") or data.get("name") or "").strip()
    email = (data.get("email") or "").strip().lower()
    password = data.get("password") or ""

    if not name or len(name) > 120:
        return jsonify({"error": "Name is required (max 120 characters)."}), 400
    if not email or not _EMAIL_RE.match(email):
        return jsonify({"error": "Valid email is required."}), 400
    if len(email) > 255:
        return jsonify({"error": "Email too long."}), 400
    if len(password) < 6:
        return jsonify({"error": "Password must be at least 6 characters."}), 400
    if len(password) > 256:
        return jsonify({"error": "Password too long."}), 400

    exists = db.session.scalar(select(User.id).where(User.email == email))
    if exists:
        return jsonify({"error": "An account with this email already exists."}), 409

    user = User(
        display_name=name[:120],
        email=email,
        password_hash=generate_password_hash(password),
    )
    db.session.add(user)
    db.session.commit()

    session.clear()
    session.permanent = True
    session["user_id"] = user.id
    return jsonify({"ok": True, "user": user.to_public_dict()}), 201


@bp.post("/api/auth/login")
def login():
    data = request.get_json(silent=True) or {}
    email = (data.get("email") or "").strip().lower()
    password = data.get("password") or ""

    if not email or not password:
        return jsonify({"error": "Email and password are required."}), 400

    user = db.session.scalar(select(User).where(User.email == email))
    if not user or not check_password_hash(user.password_hash, password):
        return jsonify({"error": "Invalid email or password."}), 401

    session.clear()
    session.permanent = True
    session["user_id"] = user.id
    return jsonify({"ok": True, "user": user.to_public_dict()})


@bp.post("/api/auth/logout")
def logout():
    session.clear()
    return jsonify({"ok": True})


@bp.get("/api/auth/me")
def me():
    uid = session.get("user_id")
    if not uid:
        return jsonify({"error": "not authenticated"}), 401
    user = db.session.get(User, uid)
    if not user:
        session.clear()
        return jsonify({"error": "not authenticated"}), 401
    return jsonify(user.to_public_dict())


@bp.get("/api/auth/my-reports")
def my_reports():
    uid = session.get("user_id")
    if not uid:
        return jsonify({"error": "log in to see your reports"}), 401
    stmt = (
        select(Report)
        .options(joinedload(Report.author))
        .where(Report.user_id == uid)
        .order_by(Report.id.desc())
    )
    rows = db.session.scalars(stmt).unique().all()
    return jsonify({"reports": [r.to_public_dict() for r in rows]})
