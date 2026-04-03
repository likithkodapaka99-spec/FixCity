"""Signup, login (session cookie), and current-user endpoints."""
from __future__ import annotations

import os
import re

from flask import Blueprint, current_app, jsonify, request, session
from sqlalchemy import select
from sqlalchemy.orm import joinedload
from werkzeug.security import check_password_hash, generate_password_hash
from werkzeug.utils import secure_filename

from app.extensions import db
from app.models import Report, User
from app import storage

bp = Blueprint("auth", __name__)

_EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")

_ALLOWED_AVATAR = {"png", "jpg", "jpeg", "gif", "webp"}


def _avatar_ext_ok(filename: str) -> bool:
    return "." in filename and filename.rsplit(".", 1)[1].lower() in _ALLOWED_AVATAR


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
        role="citizen",
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
    user = db.session.get(User, int(uid))
    if not user:
        session.clear()
        return jsonify({"error": "not authenticated"}), 401
    return jsonify(user.to_public_dict())


@bp.post("/api/auth/avatar")
def upload_avatar():
    """multipart: field `avatar` (or `file`) — image; replaces previous avatar file."""
    uid = session.get("user_id")
    if not uid:
        return jsonify({"error": "not authenticated"}), 401
    user = db.session.get(User, int(uid))
    if not user:
        session.clear()
        return jsonify({"error": "not authenticated"}), 401

    f = request.files.get("avatar") or request.files.get("file")
    if not f or not f.filename:
        return jsonify({"error": "image file is required"}), 400
    safe = secure_filename(f.filename)
    if not _avatar_ext_ok(safe):
        return jsonify({"error": "Unsupported image type"}), 400

    folder = current_app.config["UPLOAD_FOLDER"]
    new_name = storage.unique_upload_name(safe)
    path = os.path.join(folder, new_name)
    f.save(path)

    old = user.avatar_filename
    user.avatar_filename = new_name
    db.session.commit()

    if old and old != new_name:
        old_path = os.path.join(folder, old)
        try:
            if os.path.isfile(old_path):
                os.remove(old_path)
        except OSError:
            pass

    return jsonify({"ok": True, "user": user.to_public_dict()})


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
