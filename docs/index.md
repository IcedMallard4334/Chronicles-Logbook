# Chronicles — Digital Logbook

A customisable digital logbook that lets students track project work without the friction of a physical notebook. Unlike a fixed-schema tracker, every project owner defines their own entry format — field names, types, and structure — and the entire system adapts to whatever shape they choose.

## Core idea

The schema is **user-defined**, not hardcoded. Entries, statistics, filters, and dashboards all operate generically over fields the platform doesn't know about until the user creates them.

## Key features

- **Custom entry schemas** — define fields with text, number, date, and dropdown types per project
- **Quick capture** — log entries in seconds with pre-filled fields
- **Task tracking** — manage to-do items with due dates per project
- **Project management** — create, describe, and archive projects
- **Timeline view** — browse entries chronologically
- **Search and filter** — find entries across all projects
- **Statistics** — time per project, entry counts, and streak tracking
- **Dark mode** — light and dark themes with system preference detection
- **Google OAuth** — sign in with your Google account

## Tech stack

| Layer | Technology |
|---|---|
| Frontend | React + Vite |
| Backend | FastAPI (Python) |
| Database | PostgreSQL with JSONB |
| Authentication | Google OAuth via Authlib + JWT |
| Hosting | Azure App Service + Azure Web Apps |
| CI/CD | Gitea Actions |
| Documentation | MkDocs + Material |

## Quick start

```bash
# Clone the repository
git clone https://sdp.ms.wits.ac.za/driven-by-design/Chronicles.git
cd Chronicles

# Backend
cd chronicles-logbook/backend
python -m venv .venv
.\.venv\Scripts\Activate.ps1   # Windows
pip install -r requirements.txt
python -m uvicorn main:app --reload --port 8000

# Frontend (new terminal)
cd chronicles-logbook/frontend
npm install
npm run dev
```

Visit [http://localhost:5173](http://localhost:5173) to start using Chronicles.

## Team

Driven by Design — COMS3011A, University of the Witwatersrand.
