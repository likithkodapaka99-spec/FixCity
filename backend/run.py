"""
Entry point: run the API from the `backend` folder.

  cd backend
  python -m venv .venv
  .venv\Scripts\activate   # Windows
  pip install -r requirements.txt
  python run.py

Open http://127.0.0.1:5000/ (public app).

Municipality staff: set AUTHORITY_EMAIL and AUTHORITY_PASSWORD (optional AUTHORITY_DISPLAY_NAME),
restart the server, then sign in at /authority/login.

Staff console: http://127.0.0.1:5000/authority (after staff login).
"""
from app import create_app

app = create_app()

if __name__ == "__main__":
    app.run(host="127.0.0.1", port=5000, debug=True)
