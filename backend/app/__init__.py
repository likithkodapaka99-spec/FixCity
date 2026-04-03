"""
Flask application factory.

SQLite + SQLAlchemy (`instance/fixcity.db`).
"""
from __future__ import annotations

import os
import secrets
from datetime import timedelta
from pathlib import Path

from flask import Flask, redirect, send_from_directory, session
from flask_cors import CORS
from sqlalchemy import event, inspect, select, text

from app.extensions import db


def _migrate_reports_user_column() -> None:
    """SQLite: add user_id to existing reports table if missing (dev / upgrades)."""
    insp = inspect(db.engine)
    if "reports" not in insp.get_table_names():
        return
    cols = {c["name"] for c in insp.get_columns("reports")}
    if "user_id" in cols:
        return
    with db.engine.begin() as conn:
        conn.execute(text("ALTER TABLE reports ADD COLUMN user_id INTEGER"))


def _migrate_user_role_column() -> None:
    """SQLite: add users.role for municipality staff vs citizens."""
    insp = inspect(db.engine)
    if "users" not in insp.get_table_names():
        return
    cols = {c["name"] for c in insp.get_columns("users")}
    if "role" in cols:
        return
    with db.engine.begin() as conn:
        conn.execute(text("ALTER TABLE users ADD COLUMN role VARCHAR(32) DEFAULT 'citizen'"))


def _migrate_users_avatar_column() -> None:
    """SQLite: profile pictures under /uploads."""
    insp = inspect(db.engine)
    if "users" not in insp.get_table_names():
        return
    cols = {c["name"] for c in insp.get_columns("users")}
    if "avatar_filename" in cols:
        return
    with db.engine.begin() as conn:
        conn.execute(text("ALTER TABLE users ADD COLUMN avatar_filename VARCHAR(255)"))


def _migrate_volunteer_offers_user_id() -> None:
    insp = inspect(db.engine)
    if "volunteer_offers" not in insp.get_table_names():
        return
    cols = {c["name"] for c in insp.get_columns("volunteer_offers")}
    if "user_id" in cols:
        return
    with db.engine.begin() as conn:
        conn.execute(text("ALTER TABLE volunteer_offers ADD COLUMN user_id INTEGER"))


def _migrate_report_messages_user_id() -> None:
    insp = inspect(db.engine)
    if "report_messages" not in insp.get_table_names():
        return
    cols = {c["name"] for c in insp.get_columns("report_messages")}
    if "user_id" in cols:
        return
    with db.engine.begin() as conn:
        conn.execute(text("ALTER TABLE report_messages ADD COLUMN user_id INTEGER"))


def _ensure_authority_user() -> None:
    """If AUTHORITY_EMAIL and AUTHORITY_PASSWORD are set, ensure one staff account exists."""
    email = (os.environ.get("AUTHORITY_EMAIL") or "").strip().lower()
    password = os.environ.get("AUTHORITY_PASSWORD") or ""
    if not email or not password:
        return
    from werkzeug.security import generate_password_hash

    from app.models import User

    existing = db.session.scalar(select(User.id).where(User.email == email))
    name = (os.environ.get("AUTHORITY_DISPLAY_NAME") or "Municipality staff").strip()[:120]
    if existing:
        user = db.session.get(User, existing)
        if user and user.role != "authority":
            user.role = "authority"
            user.password_hash = generate_password_hash(password)
            db.session.commit()
        return
    user = User(
        display_name=name,
        email=email,
        password_hash=generate_password_hash(password),
        role="authority",
    )
    db.session.add(user)
    db.session.commit()


def _enable_sqlite_foreign_keys(engine) -> None:
    if engine.dialect.name != "sqlite":
        return

    @event.listens_for(engine, "connect")
    def _on_connect(dbapi_connection, _connection_record):
        cur = dbapi_connection.cursor()
        cur.execute("PRAGMA foreign_keys=ON")
        cur.close()


def create_app() -> Flask:
    app = Flask(__name__)

    CORS(app, resources={r"/*": {"origins": "*"}})

    backend_dir = Path(__file__).resolve().parent.parent
    upload_dir = backend_dir / "uploads"
    instance_dir = backend_dir / "instance"
    upload_dir.mkdir(parents=True, exist_ok=True)
    instance_dir.mkdir(parents=True, exist_ok=True)

    app.config["UPLOAD_FOLDER"] = str(upload_dir)
    app.config["MAX_CONTENT_LENGTH"] = 10 * 1024 * 1024

    db_path = instance_dir / "fixcity.db"
    app.config["SQLALCHEMY_DATABASE_URI"] = "sqlite:///" + db_path.as_posix()
    app.config["SQLALCHEMY_TRACK_MODIFICATIONS"] = False

    secret_path = instance_dir / "session_secret.txt"
    if not secret_path.exists():
        secret_path.write_text(secrets.token_hex(32), encoding="utf-8")
    app.config["SECRET_KEY"] = secret_path.read_text(encoding="utf-8").strip()
    app.config["SESSION_COOKIE_HTTPONLY"] = True
    app.config["SESSION_COOKIE_SAMESITE"] = "Lax"
    app.config["PERMANENT_SESSION_LIFETIME"] = timedelta(days=14)

    db.init_app(app)

    from app import models  # noqa: F401

    with app.app_context():
        _enable_sqlite_foreign_keys(db.engine)
        db.create_all()
        _migrate_reports_user_column()
        _migrate_user_role_column()
        _migrate_users_avatar_column()
        _migrate_volunteer_offers_user_id()
        _migrate_report_messages_user_id()
        _ensure_authority_user()

    from app.routes import auth, authority, community, health, reports

    app.register_blueprint(health.bp)
    app.register_blueprint(auth.bp)
    app.register_blueprint(reports.bp)
    app.register_blueprint(community.bp)
    app.register_blueprint(authority.bp)

    frontend_dir = (backend_dir.parent / "frontend").resolve()

    def _authority_allowed() -> bool:
        uid = session.get("user_id")
        if not uid:
            return False
        from app.models import User

        user = db.session.get(User, int(uid))
        return bool(user and getattr(user, "role", "citizen") == "authority")

    @app.get("/")
    def _serve_index():
        return send_from_directory(frontend_dir, "index.html")

    @app.get("/css/<path:filename>")
    def _serve_css(filename: str):
        return send_from_directory(frontend_dir / "css", filename)

    @app.get("/js/<path:filename>")
    def _serve_js(filename: str):
        return send_from_directory(frontend_dir / "js", filename)

    @app.get("/assets/<path:filename>")
    def _serve_assets(filename: str):
        return send_from_directory(frontend_dir / "assets", filename)

    @app.get("/authority/login")
    def _authority_login_page():
        if _authority_allowed():
            return redirect("/authority")
        return send_from_directory(frontend_dir / "pages", "authority-login.html")

    @app.get("/authority")
    def _authority_dashboard_page():
        if not _authority_allowed():
            return redirect("/authority/login")
        return send_from_directory(frontend_dir / "pages", "authority.html")

    @app.get("/report")
    def _report_page():
        return send_from_directory(frontend_dir / "pages", "report.html")

    @app.get("/login")
    def _login_page():
        return send_from_directory(frontend_dir / "pages", "login.html")

    @app.get("/signup")
    def _signup_page():
        return send_from_directory(frontend_dir / "pages", "signup.html")

    @app.get("/profile")
    def _profile_page():
        return send_from_directory(frontend_dir / "pages", "profile.html")

    return app
