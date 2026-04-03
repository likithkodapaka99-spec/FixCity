"""
Flask application factory.

STEP 3: SQLite + SQLAlchemy (`instance/fixcity.db`).
"""
from __future__ import annotations

import secrets
from datetime import timedelta
from pathlib import Path

from flask import Flask, send_from_directory
from flask_cors import CORS
from sqlalchemy import event, inspect, text

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

    # Demo / hackathon: allow browser frontend from any origin
    CORS(app, resources={r"/*": {"origins": "*"}})

    backend_dir = Path(__file__).resolve().parent.parent
    upload_dir = backend_dir / "uploads"
    instance_dir = backend_dir / "instance"
    upload_dir.mkdir(parents=True, exist_ok=True)
    instance_dir.mkdir(parents=True, exist_ok=True)

    app.config["UPLOAD_FOLDER"] = str(upload_dir)
    # ~10 MB — enough for phone photos in a demo
    app.config["MAX_CONTENT_LENGTH"] = 10 * 1024 * 1024

    # SQLite: use forward slashes in URI (Windows-safe)
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

    # Import models so SQLAlchemy registers tables before create_all()
    from app import models  # noqa: F401

    with app.app_context():
        _enable_sqlite_foreign_keys(db.engine)
        db.create_all()
        _migrate_reports_user_column()

    from app.routes import auth, authority, community, health, reports

    app.register_blueprint(health.bp)
    app.register_blueprint(auth.bp)
    app.register_blueprint(reports.bp)
    app.register_blueprint(community.bp)
    app.register_blueprint(authority.bp)

    # STEP 4: serve the vanilla HTML/CSS/JS UI from /frontend (same origin as API)
    frontend_dir = (backend_dir.parent / "frontend").resolve()

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

    @app.get("/authority")
    def _authority_dashboard_page():
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
