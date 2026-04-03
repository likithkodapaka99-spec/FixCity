# FixCity - Local Problem Reporter + Solver AI

Report local issues (potholes, garbage, water leaks, streetlights, etc.) with a photo + location.
FixCity provides instant rule-based triage, community support, and a fake municipality dashboard for hackathon demos.

## What it does

1. Submit a problem
   - Description
   - Image (optional)
   - GPS (latitude/longitude) (optional)
   - Timestamp is added automatically
   - Posting requires login (accounts stored with hashed passwords)

2. Instant AI triage (rule-based)
   - Classifies into categories like `garbage`, `road`, `water`, `electrical`, `general`
   - Assigns `priority` (`low` / `medium` / `high`)
   - Chooses `resolution_route`:
     - `community` (DIY/NGO guidance)
     - `authority` (municipality/power utility guidance)
   - Produces multiple suggestions (DIY steps + safety + services/NGO/authority)

3. Community support
   - "I CAN HELP" volunteer offers
   - Urgency voting (1-5)
   - Lightweight chat/messages under each report

4. Authority simulation (demo dashboard)
   - Ticket lifecycle: `Sent to Municipality` -> `In Progress` -> `Resolved`
   - Admin-style UI with auto-refresh (fake realtime)

5. Map + urgency heat-style dots
   - Leaflet (OpenStreetMap tiles)
   - Markers show only when GPS is present
   - Marker color follows triage `priority`

## Live demo (local)

- Posts & map (public): http://127.0.0.1:5000/
- New report form: http://127.0.0.1:5000/report
- Signup/Login/Profile:
  - http://127.0.0.1:5000/signup
  - http://127.0.0.1:5000/login
  - http://127.0.0.1:5000/profile
- Authority console: http://127.0.0.1:5000/authority

## Tech Stack

- Frontend: HTML, CSS, JavaScript, Leaflet.js (OpenStreetMap tiles)
- Backend: Python Flask
- Database: SQLite (via SQLAlchemy)
- AI: rule-based keyword triage (no external API required)

## How to run (step-by-step)

1. Open PowerShell
2. Start backend:
   cd "c:\Users\kodapaka likith\OneDrive\Desktop\FixCity\backend"
3. Install dependencies:
   python -m venv .venv
   .venv\Scripts\activate
   pip install -r requirements.txt
4. Run:
   python run.py
5. Open http://127.0.0.1:5000/

## Share your project during a hackathon

Use ngrok to create a public HTTPS link.

1. Add your authtoken (once):
   ngrok config add-authtoken <YOUR_TOKEN>
2. Run the tunnel:
   ngrok http 5000
3. Share the https://xxxx.ngrok-free.app/ URL with your friend(s).
   They can sign up and report problems using the same UI.

## API quick reference (what the frontend uses)

### Health
- GET /api/health

### Auth
- POST /api/auth/signup { display_name, email, password }
- POST /api/auth/login { email, password }
- POST /api/auth/logout
- GET /api/auth/me
- GET /api/auth/my-reports

### Reports
- POST /api/reports (multipart form-data: description, optional image, optional latitude, optional longitude)
- GET /api/reports
  - Optional nearby filter: ?near_lat=...&near_lng=...&radius_km=...
- GET /api/reports/<id>

### Community
- GET /api/reports/<id>/community?voter_key=<optional>
- POST /api/reports/<id>/volunteers { display_name, contact? }
- POST /api/reports/<id>/votes { voter_key, score } where score is 1-5
- POST /api/reports/<id>/messages { sender_name, body }

### Authority simulation
- GET /api/authority/dashboard
- POST /api/authority/simulate
- PATCH /api/authority/reports/<id> { authority_status }

## Project structure (high level)

- backend/ - Flask app, routes, and SQLite models
  - backend/app/ - application code
  - backend/uploads/ - uploaded images
  - backend/instance/ - SQLite DB + session secret
- frontend/ - static pages and JS
  - frontend/pages/ - /report, /profile, /login, /signup, /authority
  - frontend/js/ - feed.js, report.js, profile.js

## Notes

- Passwords are stored using hashed passwords (Werkzeug).
- Hackathon/demo build: no rate limiting and authority dashboard is simulated.

## License

MIT
