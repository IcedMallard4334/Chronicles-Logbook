# Chronicles — Backend

Part of the `chronicles-logbook` monorepo (`chronicles-logbook/backend`).
FastAPI backend for Chronicles, the digital logbook.

## Stack & hosting

- **Python 3.12 + FastAPI**, hand-written routes
- **SQLAlchemy 2.0 (async)** via `asyncpg` (Postgres) / `aiosqlite` (local dev)
- **One Azure Database for PostgreSQL**, shared connection string via `DATABASE_URL`
- **Two Azure Web Apps** — `chronicles-api` (this backend) and
  `chronicles-web-app` (the frontend) — deployed independently
- **CI/CD**: Gitea Actions (`.gitea/workflows/ci.yml` runs lint + tests on
  every push/PR; `.gitea/workflows/deploy.yml` zip-deploys straight to
  Azure App Service on push to `main`)

## Project structure

```
app/
  config.py         # env-var loading (DATABASE_URL, SQL_DEBUG)
  database.py         # async engine/session, JSONB-on-Postgres type
  models.py           # SQLAlchemy models: Project, Entry
  schemas.py           # Pydantic request/response models, field-type validation
  seed.py               # populates demo data — `python -m app.seed`
  routers/
    projects.py           # project CRUD, archive/unarchive, entry CRUD (schema-validated)
    auth.py                 # STUB — sign up/sign in return 501 until implemented
main.py                # FastAPI app, CORS, router wiring, /health
tests/
```

## Local setup

```bash
cd backend
python -m venv venv && source venv/bin/activate
pip install -r requirements.txt ruff pytest pytest-asyncio httpx aiosqlite
cp .env.example .env   # fill in DATABASE_URL
uvicorn main:app --reload
python -m app.seed     # optional: populate a demo project + entries
```

`DATABASE_URL` must use an async driver:
- Local SQLite: `sqlite+aiosqlite:///./chronicles.db`
- Azure Postgres: `postgresql+asyncpg://<user>:<url_encoded_password>@<host>:5432/chronicles`

Interactive docs: `http://localhost:8000/docs`

Run what CI runs: `ruff check .` then `pytest`

## Deployment

Both Web Apps' startup commands are set directly in the Azure Portal
(Configuration → General settings → Startup Command) — not read from any
file in this repo, so if a Web App ever needs recreating, use these exact
values (also mirrored in `startup.txt` here for that reason):

- **Backend** (`chronicles-api`):
  `pip install -r /home/site/wwwroot/requirements.txt && python -m uvicorn main:app --host 0.0.0.0 --port 8000 --app-dir /home/site/wwwroot`
- **Frontend** (`chronicles-web-app`):
  `npx serve -s /home/site/wwwroot -l 8080`

`.gitea/workflows/deploy.yml` zips this entire `backend/` folder on every
push to `main` and ships it via `ZipDeploy`, so **anything left in this
folder gets deployed** — there's no build step that prunes unused files.
Keep this directory to only what actually runs.

## Known gaps (tracked, not yet done)

- Auth is a stub only (`/auth/signup`, `/auth/signin` return 501)
- No `owner_id` / permission checks on projects yet — depends on auth landing
- No Alembic migrations — `Base.metadata.create_all()` on startup is a
  Sprint 1 stopgap; swap once the schema stabilises

## AI usage declaration

This repository makes use of AI code generation using the following tools:
Claude[Claude Sonnet 5].
This repository does not use AI in-line editing tools.
This repository does not use AI code review.
