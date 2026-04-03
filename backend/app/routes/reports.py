"""
Report CRUD-style API.

Accepts multipart form: image (optional), description, latitude, longitude.
Coordinates power the map; STEP 6 fills AI fields on create (rule-based).
"""
from __future__ import annotations

import os

from flask import Blueprint, abort, current_app, jsonify, request, send_from_directory, session
from werkzeug.utils import secure_filename

from app import storage

bp = Blueprint("reports", __name__)


def _parse_float(value: str | None, field: str) -> float | None:
    if value is None or value == "":
        return None
    try:
        return float(value)
    except ValueError:
        raise ValueError(f"Invalid number for {field}")


ALLOWED_EXTENSIONS = {"png", "jpg", "jpeg", "gif", "webp"}


def _allowed_file(filename: str) -> bool:
    return "." in filename and filename.rsplit(".", 1)[1].lower() in ALLOWED_EXTENSIONS


@bp.get("/uploads/<name>")
def serve_upload(name):
    """Serve files saved under backend/uploads (dev/hackathon convenience)."""
    if "/" in name or "\\" in name or name.startswith("."):
        abort(404)
    folder = current_app.config["UPLOAD_FOLDER"]
    return send_from_directory(folder, name)


@bp.post("/api/reports")
def create_report():
    """
    multipart/form-data:
      - description (required)
      - latitude, longitude (optional)
      - image (optional file)

    Requires a logged-in user (session cookie from /api/auth/login).
    """
    uid = session.get("user_id")
    if not uid:
        return (
            jsonify(
                {
                    "error": "log in required",
                    "message": "Create an account or log in to post a report.",
                    "login_url": "/login",
                    "signup_url": "/signup",
                    "report_url": "/report",
                }
            ),
            401,
        )

    description = (request.form.get("description") or "").strip()
    if not description:
        return jsonify({"error": "description is required"}), 400

    try:
        lat = _parse_float(request.form.get("latitude"), "latitude")
        lng = _parse_float(request.form.get("longitude"), "longitude")
    except ValueError as e:
        return jsonify({"error": str(e)}), 400

    image_filename = None
    if "image" in request.files:
        file = request.files["image"]
        if file and file.filename:
            safe = secure_filename(file.filename)
            if not _allowed_file(safe):
                return jsonify({"error": "Unsupported image type"}), 400
            image_filename = storage.unique_upload_name(safe)
            path = os.path.join(current_app.config["UPLOAD_FOLDER"], image_filename)
            file.save(path)

    row = storage.create_report(
        description=description,
        latitude=lat,
        longitude=lng,
        image_filename=image_filename,
        user_id=int(uid),
    )
    return jsonify(row), 201


@bp.get("/api/reports")
def list_reports():
    """
    All reports (newest first).

    Optional nearby filter (all three required together):
      ?near_lat=..&near_lng=..&radius_km=..
    """
    near_lat = request.args.get("near_lat", type=float)
    near_lng = request.args.get("near_lng", type=float)
    radius_km = request.args.get("radius_km", type=float)
    if (
        near_lat is not None or near_lng is not None or radius_km is not None
    ):
        if near_lat is None or near_lng is None or radius_km is None:
            return jsonify(
                {
                    "error": "near_lat, near_lng, and radius_km must be provided together",
                }
            ), 400
        if radius_km <= 0 or radius_km > 200:
            return jsonify({"error": "radius_km must be between 0 and 200"}), 400

    rows = storage.list_reports(
        near_lat=near_lat,
        near_lng=near_lng,
        radius_km=radius_km,
    )
    return jsonify({"reports": rows})


@bp.get("/api/reports/<int:report_id>")
def get_report(report_id: int):
    row = storage.get_report(report_id)
    if not row:
        return jsonify({"error": "not found"}), 404
    return jsonify(row)
