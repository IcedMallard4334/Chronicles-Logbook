# Chronicles

![CI](https://sdp.ms.wits.ac.za/driven-by-design/Chronicles/actions/workflows/ci.yml/badge.svg?branch=main)
![Deploy](https://sdp.ms.wits.ac.za/driven-by-design/Chronicles/actions/workflows/deploy.yml/badge.svg?branch=main)

A customisable digital logbook that lets students track project work without the friction (or forgetfulness) of a physical notebook. Unlike a fixed-schema tracker, every project owner defines their own entry format — field names, types, and structure — and the entire system (capture, statistics, views, search) adapts to whatever shape they choose, rather than the other way around.

Recent additions include time tracking per entry with accumulated totals per project, task checklists with progress bars, a dedicated profile page, and both password-based and Google authentication.

## Core idea

The schema is user-defined, not hardcoded. Entries, statistics, filters, and dashboards all operate generically over fields the platform doesn't know about until the user creates them. This is the core design constraint that everything else is built against.

## Table of contents

- [Prerequisites](#prerequisites)
- [Repository structure](#repository-structure)
- [Getting started](#getting-started)
  - [Backend](#backend)
  - [Frontend](#frontend)
- [Environment variables](#environment-variables)
- [Running the project](#running-the-project)
- [Running tests](#running-tests)
- [Tech stack](#tech-stack)
- [Contributing](#contributing)
- [Features](#features)
- [Deployment](#deployment)
- [Status](#status)
- [AI declaration](#ai-declaration)

## Prerequisites

You need the following installed before you can run the project locally:

- **Python 3.12** — for the backend
- **Node.js 20+** — for the frontend
- **PostgreSQL 15+** — or a PostgreSQL-compatible database
  - Windows users can use the [PostgreSQL installer](https://www.postgresql.org/download/windows/)
  - Alternatively, use [Docker](https://www.docker.com/) to run Postgres locally
- **Git** — to clone the repository

A GitHub account is only required if you want to use the GitHub integration; it is not needed for local development.

## Repository structure

```
Chronicles/
├── .gitea/workflows/          # CI/CD pipelines
├── chronicles-logbook/
│   ├── backend/               # FastAPI backend
│   │   ├── app/
│   │   │   ├── routers/       # API route modules
│   │   │   ├── models.py      # SQLAlchemy models
│   │   │   ├── schemas.py     # Pydantic request/response schemas
│   │   │   ├── database.py    # Async SQLAlchemy engine/session
│   │   │   ├── security.py    # Password hashing and JWT helpers
│   │   │   └── email.py       # Transactional email helpers
│   │   ├── main.py
│   │   ├── requirements.txt
│   │   └── tests/
│   └── frontend/              # React + Vite frontend
│       ├── src/
│       │   ├── App.jsx        # Main app shell and project views
│       │   ├── AuthPage.jsx   # Sign-in / sign-up UI
│       │   ├── ProfilePage.jsx# Account, theme, sign-out, delete account
│       │   ├── TaskPanel.jsx  # Task and checklist UI
│       │   ├── api.js         # API client
│       │   └── main.jsx       # React Router routes
│       ├── index.html
│       ├── package.json
│       └── vite.config.js
├── docs/                      # MkDocs documentation
└── README.md
```

## Getting started

### 1. Clone the repository

```bash
git clone https://sdp.ms.wits.ac.za/driven-by-design/Chronicles.git
cd Chronicles
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
python -m pip install ruff pytest pytest-asyncio httpx aiosqlite
```

Create a `.env` file in `chronicles-logbook/backend/`:

```env
DATABASE_URL=postgresql+asyncpg://user:password@localhost:5432/chronicles
CORS_ORIGINS=http://localhost:5173
SQL_DEBUG=false
```

Replace `user`, `password`, and `chronicles` with your actual Postgres credentials and database name.

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
```

## Environment variables

### Backend (`chronicles-logbook/backend/.env`)

| Variable | Required | Description |
|---|---|---|
| `DATABASE_URL` | Yes | Async PostgreSQL connection string, e.g. `postgresql+asyncpg://user:pass@localhost:5432/chronicles` |
| `CORS_ORIGINS` | No | Comma-separated list of allowed frontend origins. Defaults to `http://localhost:5173,https://localhost:5173` |
| `SQL_DEBUG` | No | Set to `true` to log every SQL statement. Defaults to `false` |
| `JWT_SECRET_KEY` | Yes | Secret used to sign JWT access tokens |
| `ACCESS_TOKEN_EXPIRE_MINUTES` | No | JWT expiry time. Defaults to `60` |
| `SESSION_SECRET_KEY` | Yes | Secret used for OAuth session state |
| `GOOGLE_CLIENT_ID` | No | Google OAuth client ID (required for Google sign-in) |
| `GOOGLE_CLIENT_SECRET` | No | Google OAuth client secret (required for Google sign-in) |
| `OAUTH_REDIRECT_URI` | No | Google OAuth callback URL. Defaults to `http://localhost:8000/auth/google/callback` |
| `FRONTEND_URL` | Yes | URL of the frontend, used for password-reset and OAuth redirects |
| `BREVO_SMTP_HOST` | No | SMTP host for transactional emails |
| `BREVO_SMTP_PORT` | No | SMTP port for transactional emails |
| `BREVO_SMTP_USERNAME` | No | SMTP username |
| `BREVO_SMTP_PASSWORD` | No | SMTP password |
| `MAIL_FROM` | No | Sender email address for transactional emails |
| `MAIL_FROM_NAME` | No | Sender name for transactional emails. Defaults to `Chronicles` |
| `PASSWORD_RESET_EXPIRE_MINUTES` | No | Password reset token expiry. Defaults to `60` |
| `DATABASE_SSL` | No | Set to `true` to require SSL for PostgreSQL connections |

### Frontend (`chronicles-logbook/frontend/.env`)

| Variable | Required | Description |
|---|---|---|
| `VITE_API_URL` | No | URL of the backend API. Defaults to `http://localhost:8000` |

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

Open `http://localhost:5173` in your browser and you should be able to create a project, define an entry schema, log entries with time spent, manage tasks with checklists, and view everything from the project dashboard.

## Running tests

### Backend tests

From `chronicles-logbook/backend` with your virtual environment active:

```bash
python -m pytest
```

To run the linter:

```bash
python -m ruff check .
```

### Frontend tests

From `chronicles-logbook/frontend`:

```bash
# Run tests once
npm run test -- --run

# Run tests in watch mode during development
npm run test

# Run the linter
npm run lint

# Create a production build
npm run build
```

## Tech stack

- **Frontend:** React 19 with Vite and React Router — component-based, schema-driven UI (forms, timelines, stats views, and checklists all render dynamically from user-defined fields and backend state).
- **Backend:** FastAPI (Python 3.12+) — hand-written REST API with async SQLAlchemy ORM, and built-in OpenAPI/Swagger docs for easy testing and documentation.
- **Database:** Azure Database for PostgreSQL (Flexible Server) — chosen over SQLite to avoid App Service's filesystem persistence limitations, and over Firebase/Firestore to keep our API genuinely hand-written per the project brief. PostgreSQL's JSONB column type lets us store user-defined entry fields and task checklists flexibly alongside strongly-typed core fields.
- **Authentication:** JWT-based sessions. Supports both **password-based accounts** (bcrypt-hashed credentials with email password-reset flow) and **Google OAuth** (via Authlib), so users can choose their preferred sign-in method.
- **External Integration:**
  - **GitHub API** — students can link a project to a GitHub repo and pull recent commits, using commit messages to pre-fill or suggest logbook entries (ties directly into our Quick Capture feature).
  - **Google Calendar API** — outstanding tasks (with due dates) can sync to the student's calendar, so unfinished work surfaces outside the app too.
- **Hosting:** Azure App Service (backend) + Azure Web Apps (frontend) — a non-monolithic split satisfying the key project requirement, consolidated on one platform for simpler credential and cost management across the team.
- **CI/CD:** Gitea Actions — lint/test/build on every PR, automatic deploy to Azure on merge to main.

## Features

- **User-defined entry schemas** — each project defines its own fields (`text`, `number`, `date`, `dropdown`), and the capture forms, project dashboard, and search adapt automatically.
- **Time tracking** — log `time_spent` (in minutes) on each entry; projects expose a computed `total_time_spent` aggregate.
- **Task management** — create, update, complete, and delete tasks per project, with optional due dates and a per-task checklist that shows a progress bar.
- **Global entry search** — search across all entries and filter by project via `/entries`.
- **Authentication** — sign up and sign in with email/password or Google OAuth; password resets via secure token email.
- **Profile page** — view account details, switch theme (light/dark/system), sign out, and delete the account with `DELETE` confirmation.

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

Make sure your changes pass lint and tests:

```bash
# Backend
python -m ruff check .
python -m pytest

# Frontend
npm run lint
npm run test -- --run
```

## Deployment

Deployment is handled automatically by Gitea Actions when changes are merged into `main`:

- `.gitea/workflows/ci.yml` runs lint and tests on pull requests and pushes to `main`.
- `.gitea/workflows/deploy.yml` deploys the backend and frontend to Azure App Service.

For Azure deployment details (publish profiles, environment variables, etc.), see the project wiki or ask the team lead.

## Status

🚧 In development.

## AI declaration

Project specification generated with Claude Code (Claude Opus 4.8), per course requirements.
