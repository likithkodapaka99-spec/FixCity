"""
Entry point: run the API from the `backend` folder.

  cd backend
  python -m venv .venv
  .venv\\Scripts\\activate   # Windows
  pip install -r requirements.txt
  python run.py

Then open http://127.0.0.1:5000/ (reporter) and http://127.0.0.1:5000/authority (ops demo).
"""
from app import create_app

app = create_app()

if __name__ == "__main__":
    # debug=True for hackathon demo; turn off in production
    app.run(host="127.0.0.1", port=5000, debug=True)
