# Chronicles



![Backend Coverage](badges/backend-coverage.svg)
![Frontend Coverage](badges/frontend-coverage.svg)

A customisable digital logbook that lets students track project work without the friction (or forgetfulness) of a physical notebook. Unlike a fixed-schema tracker, every project owner defines their own entry format — field names, types, and structure — and the entire system (capture, statistics, views, search) adapts to whatever shape they choose, rather than the other way around.

Chronicles is built for COMS3011A (Project 7) at Wits. Besides logging entries and tasks, it supports sharing a project with a team (with private and shared notes), rules and recurring entries, a Gemini-backed assistant called Mira, streaks and badges, offline capture, and a documented public API. See [Features](#features) and the [release notes](RELEASE_NOTES.md).

## About this repository

Chronicles was built as a group project for COMS3011A (Software Design) at the University of the Witwatersrand in
2026 by team **Driven by Design**: Athalia, Ethan Chigodo, Hlakulo, Nkosilathi Dube, Tebogo Sebopela and Victor
Hyginus. Development happened on the university's own Gitea server, which is no longer available, so this repository
is the public home of the project.

The full history is kept, and every commit still carries its author's name. Before publishing, two things were
changed: credentials that had been committed by mistake were removed from every commit, and personal email
addresses were replaced. The CI and deployment workflows are in `.gitea/workflows/` and do not run on GitHub.

## Links

| | URL |
|---|---|
| **Documentation** | [chronicles-drivenbydesign-docs.azurewebsites.net](https://chronicles-drivenbydesign-docs.azurewebsites.net) |
| **Live app** | [chronicles-drivenbydesign-app…azurewebsites.net](https://chronicles-drivenbydesign-app-hfeehwdce7dfd9fr.uaenorth-01.azurewebsites.net/) |
| **API (Swagger)** | [chronicles-drivenbydesign-api…azurewebsites.net/docs](https://chronicles-drivenbydesign-api-gub5h0e8aee0gcb0.uaenorth-01.azurewebsites.net/docs) |
| **Repository** | [github.com/IcedMallard4334/Chronicles-Logbook](https://github.com/IcedMallard4334/Chronicles-Logbook) |
| **Release notes** | [RELEASE_NOTES.md](RELEASE_NOTES.md) |
| **Decision log** | [docs/decisions](docs/decisions/index.md): every design decision, with its reason |


## Core idea

The schema is user-defined, not hardcoded. Entries, statistics, filters, and dashboards all operate generically over fields the platform doesn't know about until the user creates them. This is the core design constraint that everything else is built against.

## Table of contents

- [Links](#links)
- [Features](#features)
- [Prerequisites](#prerequisites)
- [Repository structure](#repository-structure)
- [Getting started](#getting-started)
- [Environment variables](#environment-variables)
- [Running the project](#running-the-project)
- [Running tests](#running-tests)
- [The API](#the-api)
- [Tech stack](#tech-stack)
- [Contributing](#contributing)
- [Deployment](#deployment)
- [Documentation](#documentation)
- [Status](#status)
- [AI Usage](#ai-usage)

## Features

**Your logbook, your format**

- **User-defined entry schemas** — each project defines its own fields (short text, long text, number, date, choice, tags, checklist, entry link, project link and calculation); capture forms, views and search adapt automatically.
- **Editable schemas** — change fields after a project has entries; a preview shows what the change does first, and removed fields are retired, never deleted.
- **Time tracking, tasks and statuses** — time spent per entry, tasks with due dates, times and checklists, and 2 to 8 ordered statuses per project.
- **Entry history** — every edit keeps the previous values as a numbered version; any version can be restored and deleted entries can be brought back.

**Finding and understanding your work**

- **Structured search, saved filters and a global Activity view** over every entry, plus statistics, field trends, a customisable dashboard, a Board and a Calendar (with optional Google Calendar).

**Working with others**

- **Sharing by invitation**, with owners who reshape a project and members who add entries and tasks and edit only their own.
- **Project team view** — who is working on a project and what each person has done, with a recent-activity feed and a "Logged by" filter.
- **Project notes** — a Notes tab where each note is private to its author or shared with the team, shown with the author's name and colour, and searchable.

**Automation, assistance and motivation**

- **Rules, recurring entries and reminders.**
- **Mira** — a Gemini-backed assistant that can do what you can do by hand, always with your confirmation, optional and consent-gated; replies stream, conversations are saved, and there is voice dictation.
- **Daily streaks and 34 achievement badges.**

**Everywhere, and for everyone**

- **Offline capture and sync**, JSON and CSV import and export, a phone layout of its own, light/dark/system themes with accent colours, and an accessibility pass (axe-core scanned by hand, Lighthouse accessibility score of 100 on the landing page).
- **Google sign-in** only: no passwords are stored.
- **Our own tooltips and confirmation dialogs** instead of the browser's.

The full list, with how each feature is tested, is in the [documentation](https://chronicles-drivenbydesign-docs.azurewebsites.net) and in [RELEASE_NOTES.md](RELEASE_NOTES.md).

## Prerequisites

You need the following installed before you can run the project locally:

- **Python 3.12** — for the backend
- **Node.js 20+** — for the frontend
- **PostgreSQL 15+** — or a PostgreSQL-compatible database
  - Windows users can use the [PostgreSQL installer](https://www.postgresql.org/download/windows/)
  - Alternatively, use [Docker](https://www.docker.com/) to run Postgres locally
- **Git** — to clone the repository

You do not need a Google Cloud project or a Gemini key to run the app locally: sign-in can be done with a local-only developer login (see [Running the project](#running-the-project)), and Mira is optional. The automated tests use SQLite, so they need no database server.

## Repository structure

```
Chronicles/
├── .gitea/workflows/          # CI (ci.yml), deploy (deploy.yml) and docs deploy (deploy-docs.yml)
├── chronicles-logbook/
│   ├── backend/               # FastAPI backend
│   │   ├── app/
│   │   │   ├── routers/       # One module per area: projects, entries, tasks, notes, invitations,
│   │   │   │                  #   automation, ai (Mira), calendar, statistics, public, ...
│   │   │   ├── services/      # External services (Gemini)
│   │   │   ├── models.py      # SQLAlchemy models
│   │   │   ├── schemas.py     # Pydantic request/response schemas
│   │   │   ├── search.py      # Structured search
│   │   │   ├── schema_migration.py  # Previewing and applying a schema change
│   │   │   ├── database.py    # Async SQLAlchemy engine/session
│   │   │   └── config.py      # Settings read from the environment
│   │   ├── migrations/        # .sql files recording each schema change (the app applies them on start)
│   │   ├── main.py
│   │   ├── requirements.txt
│   │   └── tests/
│   ├── frontend/              # React + Vite frontend
│   │   ├── src/               # Components, pages, api.js and their tests
│   │   ├── index.html
│   │   ├── package.json
│   │   └── vite.config.js
│   └── scripts/               # docs_audit.py, load_test.py, coverage helpers
├── docs/                      # MkDocs documentation (architecture, API, decisions, testing)
├── RELEASE_NOTES.md
└── README.md
```

## Getting started

### 1. Clone the repository

```bash
git clone https://github.com/IcedMallard4334/Chronicles-Logbook.git
cd Chronicles-Logbook
```

### 2. Start PostgreSQL

Create a local database for the project. For example:

```bash
# macOS/Linux (after installing Postgres)
createdb chronicles

# Windows (from psql or pgAdmin)
CREATE DATABASE chronicles;
```

Make a note of the username, password, host, port, and database name — you will need them for `DATABASE_URL`.

### 3. Backend setup

```bash
cd chronicles-logbook/backend

# Create a virtual environment (recommended)
python -m venv .venv

# Activate the virtual environment
# Windows PowerShell:
.\.venv\Scripts\Activate.ps1
# Windows Command Prompt:
.\.venv\Scripts\activate.bat
# macOS/Linux:
source .venv/bin/activate

# Install dependencies
python -m pip install --upgrade pip
python -m pip install -r requirements.txt

# Install development/test dependencies
python -m pip install ruff pytest pytest-asyncio pytest-cov httpx aiosqlite
```

Create a `.env` file in `chronicles-logbook/backend/` (the file `.env.example` next to it lists every setting; copy it and fill it in), for example:

```env
DATABASE_URL=postgresql+asyncpg://user:password@localhost:5432/chronicles
JWT_SECRET_KEY=replace-with-a-random-string-of-at-least-32-characters
CORS_ORIGINS=http://localhost:5173
ENABLE_DEV_LOGIN=true
```

Replace `user`, `password`, and `chronicles` with your actual Postgres credentials and database name. `JWT_SECRET_KEY` is required and must be at least 32 characters; the app refuses to start without it. `ENABLE_DEV_LOGIN` is for your own machine only (see below) and must never be set on a deployment.

The tables are created automatically the first time the backend starts. There is no separate migration step.

### 4. Frontend setup

Open a second terminal from the repository root:

```bash
cd chronicles-logbook/frontend

# Install dependencies
npm install
```

Create a `.env` file in `chronicles-logbook/frontend/`:

```env
VITE_API_URL=http://localhost:8000
VITE_ENABLE_DEV_LOGIN=true
```

## Environment variables

### Backend (`chronicles-logbook/backend/.env`)

| Variable | Required | Description |
|---|---|---|
| `DATABASE_URL` | Yes | Async PostgreSQL connection string, e.g. `postgresql+asyncpg://user:pass@localhost:5432/chronicles` |
| `JWT_SECRET_KEY` | Yes | Secret used to sign session tokens. At least 32 characters; the app will not start without it |
| `CORS_ORIGINS` | No | Comma-separated list of allowed frontend origins. Defaults to `http://localhost:5173,https://localhost:5173` |
| `FRONTEND_URL` | In production | URL of the frontend, used for sign-in redirects. Defaults to `http://localhost:5173` |
| `SQL_DEBUG` | No | Set to `true` to log every SQL statement. Defaults to `false` |
| `DATABASE_SSL` | No | Set to `true` to require SSL for PostgreSQL connections |
| `ACCESS_TOKEN_EXPIRE_MINUTES` | No | Session token expiry. Defaults to `60` |
| `SESSION_SECRET_KEY` | No | Secret for the sign-in handshake. Defaults to `JWT_SECRET_KEY` |
| `COOKIE_SECURE` | No | Set to `true` on a deployment served over HTTPS. Defaults to `false` |
| `GOOGLE_CLIENT_ID` | For Google sign-in | Google OAuth client ID |
| `GOOGLE_CLIENT_SECRET` | For Google sign-in | Google OAuth client secret |
| `OAUTH_REDIRECT_URI` | No | Google sign-in callback URL. Defaults to `http://localhost:8000/auth/google/callback` |
| `GOOGLE_CALENDAR_REDIRECT_URI` | No | Google Calendar callback. Derived from `OAUTH_REDIRECT_URI` when unset |
| `ENABLE_DEV_LOGIN` | No | `true` opens `POST /auth/dev-login`, which signs in any email without Google. **Local use only; never set on a deployment.** Defaults to `false` |
| `GEMINI_API_KEY` | For Mira | Google Gemini API key. Mira is unavailable without it; the rest of the app is unaffected |
| `GEMINI_MODEL` | No | Gemini model name. Defaults to `gemini-3.5-flash-lite` |
| `RESEND_API_KEY` | No | Used only to send the account-deletion confirmation email. If it is missing, deleting an account still works |
| `EMAIL_FROM` | No | Sender address for that email |

### Frontend (`chronicles-logbook/frontend/.env`)

| Variable | Required | Description |
|---|---|---|
| `VITE_API_URL` | No | URL of the backend API. Defaults to `http://localhost:8000` |
| `VITE_ENABLE_DEV_LOGIN` | No | `true` shows the developer sign-in on the sign-in page. Local use only |

Never commit a real `.env` file or any key. Credentials on the deployment come from Azure Application Settings.

## Running the project

You need both the backend and frontend running at the same time.

### Start the backend

From `chronicles-logbook/backend` with your virtual environment active:

```bash
python -m uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

The API will be available at `http://localhost:8000`. Interactive API docs are at `http://localhost:8000/docs`.

### Start the frontend

From `chronicles-logbook/frontend`:

```bash
npm run dev
```

The frontend will be available at `http://localhost:5173`.

### Signing in locally

Open `http://localhost:5173`. With the developer login enabled (as in the `.env` files above) you can sign in with any email address on the sign-in page, without Google. To use real Google sign-in instead, set `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` and a matching `OAUTH_REDIRECT_URI`.

Once signed in you can create a project, define its entry schema, log entries and tasks, invite a second account to share it, and write notes.

## Running tests

### Backend tests

From `chronicles-logbook/backend` with your virtual environment active:

```bash
# Run the suite (about 800 tests, using SQLite, so no database server is needed)
python -m pytest

# With coverage
python -m pytest --cov=app --cov=main --cov-report=term

# Lint
python -m ruff check .
```

### Frontend tests

From `chronicles-logbook/frontend`:

```bash
# Run tests once (about 1,000 tests)
npm run test -- --run

# With coverage
npx vitest run --coverage

# Run tests in watch mode during development
npm run test

# Run the linter
npm run lint

# Create a production build
npm run build
```

### Documentation check

The docs are checked against the running code: this lists any route, table, migration or setting the documentation has missed.

```bash
cd chronicles-logbook/backend
python ../scripts/docs_audit.py
```

Targets are above 90% statement coverage for the backend and above 80% for the frontend. At the time of writing they are about 95% and 85%. What the tests do not cover, and why, is in [docs/decisions/not-tested.md](docs/decisions/not-tested.md).

## The API

A hand-written REST API with generated OpenAPI documentation at `/docs` (Swagger) and `/openapi.json`. Every endpoint needs `Authorization: Bearer <token>` except four read-only reference endpoints that hold nobody's data:

| Endpoint | Returns |
|---|---|
| `GET /health` | `{"status": "ok"}` |
| `GET /public/info` | What the API is, and where its documentation is |
| `GET /public/field-types` | Every field type, what it stores, and how it can be searched |
| `GET /public/limits` | The limits the API enforces |

Endpoint-by-endpoint documentation, with request and response examples, is under [docs/api](docs/api/overview.md).

## Tech stack

- **Frontend:** React 19 with Vite and React Router — component-based, schema-driven UI (forms, timelines, stats views, and checklists all render dynamically from user-defined fields and backend state). Tested with Vitest and React Testing Library.
- **Backend:** FastAPI (Python 3.12+) — hand-written REST API with async SQLAlchemy ORM, and built-in OpenAPI/Swagger docs for easy testing and documentation. Tested with pytest.
- **Database:** Azure Database for PostgreSQL (Flexible Server) — chosen over SQLite to avoid App Service's filesystem persistence limitations, and over Firebase/Firestore to keep our API genuinely hand-written per the project brief. PostgreSQL's JSONB column type lets us store user-defined entry fields flexibly alongside strongly-typed core fields. SQLite is used for the automated tests and quick local runs.
- **Authentication:** Google OAuth 2.0 / OpenID Connect (via Authlib) with a server-issued JWT session. There are no passwords: an email-and-password flow was built and removed (decision DB-54).
- **External integrations:**
  - **Google Calendar API** — optional, read-only: shows the person's calendar events alongside their entries and deadlines.
  - **Google Gemini API** — powers Mira, the optional assistant, only after the person consents.
  - **Resend** — sends one email, confirming an account deletion.
- **Hosting:** Azure App Service (backend) + Azure Web Apps (frontend) — a non-monolithic split satisfying the key project requirement, consolidated on one platform for simpler credential and cost management across the team.
- **CI/CD:** Gitea Actions — lint/test/build on every PR, automatic deploy to Azure on merge to main.
- **Documentation:** MkDocs with Material and Mermaid diagrams.

## Contributing

We use a trunk-based workflow:

1. Create a feature branch from `main`:
   ```bash
   git checkout -b feat/your-feature-name
   ```
2. Make your changes and commit them. Use clear, descriptive commit messages:
   ```bash
   git commit -m "feat(backend): add search endpoint"
   ```
3. Push your branch:
   ```bash
   git push -u origin feat/your-feature-name
   ```
4. Open a pull request in Gitea. The CI pipeline will run lint and tests automatically.
5. After review, merge into `main`. The deploy pipeline will push the changes to Azure.

### Branch naming conventions

- `feat/<short-description>` — new feature
- `fix/<short-description>` — bug fix
- `docs/<short-description>` — documentation change
- `chore/<short-description>` — maintenance or tooling change

### Before committing

Make sure your changes pass lint and tests, and that the docs still match the code:

```bash
# Backend (from chronicles-logbook/backend)
python -m ruff check .
python -m pytest
python ../scripts/docs_audit.py

# Frontend (from chronicles-logbook/frontend)
npm run lint
npm run test -- --run
```

When you change behaviour, update the docs in the same pull request, and record the decision and its reason in [docs/decisions](docs/decisions/index.md). See also [CONTRIBUTING.md](CONTRIBUTING.md).

## Deployment

Deployment is handled automatically by Gitea Actions when changes are merged into `main`:

- `.gitea/workflows/ci.yml` runs lint and tests on pull requests and pushes to `main`.
- `.gitea/workflows/deploy.yml` deploys the backend and frontend to Azure App Service.
- `.gitea/workflows/deploy-docs.yml` builds and publishes the documentation site.

The backend creates any missing tables and columns when it starts, so a deploy that adds a table needs no manual database step. The `.sql` files in `chronicles-logbook/backend/migrations/` record each change (decision DB-51).

For Azure deployment details (publish profiles, environment variables, etc.), see [chronicles-logbook/AUTHENTICATION_AND_AZURE.md](chronicles-logbook/AUTHENTICATION_AND_AZURE.md) and the [deployment documentation](docs/development/deployment.md).

## Documentation

The full project documentation is built with MkDocs and published at
[chronicles-drivenbydesign-docs.azurewebsites.net](https://chronicles-drivenbydesign-docs.azurewebsites.net).

The documentation site includes:

- **Getting Started** — prerequisites, installation, running the project
- **Architecture** — system design with diagrams (system context, components, a full entity-relationship diagram, class, sequence, activity and state diagrams, an API map), and authentication and Azure configuration
- **API Reference** — full endpoint documentation with request/response examples
- **Decisions** — every design and architectural decision with its reason, and every area the tests do not cover and why
- **Features** — what changed and when, including the release notes
- **Development** — contributing guide, testing strategy, deployment, third-party code
- **Methodology** — project methodology (Scrumban), Git workflow, sprint meetings, sprint review, and potential risks

### Building docs locally

```bash
pip install -r docs/requirements.txt
python -m mkdocs build        # Build to site/
python -m mkdocs serve        # Live preview at http://localhost:8001
```

## Status

Final release for Milestone 4 (due 11 October 2026). The known limits, and what is still worth checking before submission, are listed at the end of [RELEASE_NOTES.md](RELEASE_NOTES.md).

## AI Usage

This repository makes use of AI code generation using the following tools: Qoder, Claude Code.
This repository makes use of AI in-line editing using the following tools: Qoder.
This repository makes use of AI code-review using the following tools: Qoder, Claude Code.

Documentation pages carry an "AI Declaration" at the end naming the tool that drafted or edited them. The libraries the project depends on, and why each was chosen, are in [docs/development/third-party-code.md](docs/development/third-party-code.md).
