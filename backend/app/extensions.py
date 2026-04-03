"""
Shared Flask extensions (STEP 3).

`db` is initialized in `create_app` to avoid circular imports with models.
"""
from flask_sqlalchemy import SQLAlchemy

db = SQLAlchemy()
