"""Simple health check for demos and monitoring."""
from flask import Blueprint, jsonify

bp = Blueprint("health", __name__)


@bp.get("/api/health")
def health():
    return jsonify(
        {
            "ok": True,
            "service": "fixcity-local-problem-reporter",
            "version": "1.0.0-hackathon",
            "integration": "steps 1-9: reporter, map, AI rules, community, authority demo",
        }
    )
