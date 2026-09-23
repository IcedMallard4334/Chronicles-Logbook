# Chronicles

![CI](https://sdp.ms.wits.ac.za/driven-by-design/Chronicles/actions/workflows/ci.yml/badge.svg?branch=main)
![Deploy](https://sdp.ms.wits.ac.za/driven-by-design/Chronicles/actions/workflows/deploy.yml/badge.svg?branch=main)


![Backend Coverage](badges/backend-coverage.svg)
![Frontend Coverage](badges/frontend-coverage.svg)

A customisable digital logbook that lets students track project work without the friction (or forgetfulness) of a physical notebook. Unlike a fixed-schema tracker, every project owner defines their own entry format — field names, types, and structure — and the entire system (capture, statistics, views, search) adapts to whatever shape they choose, rather than the other way around.

Recent work has focused on making that promise hold in both directions: a
project's format can change without the entries already written being touched,
entries can be corrected and removed, sharing asks before it grants, and the
statistics follow whatever fields their owner has defined.

## Links

| | URL |
|---|---|
| **Live app** | [chronicles-drivenbydesign-app…azurewebsites.net](https://chronicles-drivenbydesign-app-hfeehwdce7dfd9fr.uaenorth-01.azurewebsites.net/) |
| **Documentation** | [chronicles-drivenbydesign-docs.azurewebsites.net](https://chronicles-drivenbydesign-docs.azurewebsites.net) |
| **API (Swagger)** | [chronicles-drivenbydesign-api…azurewebsites.net/docs](https://chronicles-drivenbydesign-api-gub5h0e8aee0gcb0.uaenorth-01.azurewebsites.net/docs) |
| **Repository** | [sdp.ms.wits.ac.za/driven-by-design/Chronicles](https://sdp.ms.wits.ac.za/driven-by-design/Chronicles) |


## Core idea

The schema is user-defined, not hardcoded. Entries, statistics, filters, and dashboards all operate generically over fields the platform doesn't know about until the user creates them. This is the core design constraint that everything else is built against.

## Table of contents

- [Links](#links)
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
- [Documentation](#documentation)
- [Status](#status)
- [AI Usage](#ai-usage)

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

### The record

- **User-defined entry formats** — each project decides what an entry holds:
  text, numbers, dates, a choice, tags, a checklist, a link to another entry, a
  link to another project, or a calculation over the other fields. Capture,
  search, statistics and every view adapt to whatever is chosen. The builder
  explains each type with the question it answers and a worked example, rather
  than offering nine words in a dropdown.
- **A format change never rewrites what is already recorded.** Add, remove,
  rename or retype a field and every existing entry keeps its values exactly as
  written, along with the format it was written under. Reading reconciles the
  two: an entry shows under today's format where the fields line up, and under
  its own where they do not. A field an entry predates reads as *not recorded*,
  which is not the same as blank.
- **Entries can be corrected and removed.** Editing asks for the fields the
  entry actually has, so a correction can never become a migration.
- **Timeline** — the whole record, grouped by day, searchable, narrowable to one
  project.

### Capturing

- **Quick capture** — <kbd>Ctrl</kbd>+<kbd>Enter</kbd> from anywhere opens a
  capture box on the project you wrote in last, with dates on today and the
  choice and tags you used last time already filled in. It stays open for the
  next entry.
- **Offline capture** — entries written without a connection are queued on the
  device and synced when it returns, without duplicating.
- **Time tracking** — log time on each entry; projects accumulate a
  `total_time_spent`.
- **Tasks** — what is still to do, per project, with due dates and checklists.

### Statistics

- **Time per project, activity over a week or a term, and streaks**, with empty
  periods shown as gaps rather than closed up.
- **Any field you have defined** — totalled, averaged, grouped and plotted over
  time, including values recorded under earlier versions of that field and
  fields the project no longer collects.
- **Exports** — the whole logbook or one project, as CSV, alongside a JSON
  export that round-trips.

### Working together

- **Invitations, not grants** — sharing a project asks; nothing reaches the
  invitee's workspace until they accept, and they can leave whenever they like.
- **Attribution** — every entry and task records who wrote it and who ticked it
  off.

### The app

- **A guided tour on first sign-in**, and a one-card explanation the first time
  each page is opened. Replayable from the profile page.
- **Four themes** — each with its own backdrop, dimmed in dark mode, and a light
  / dark / system switch.
- **Authentication** — email and password or Google, with password resets.
- Responsive to phone width, keyboard-operable, and honours
  `prefers-reduced-motion`.

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

## Documentation

The full project documentation is built with MkDocs and published at
[chronicles-drivenbydesign-docs.azurewebsites.net](https://chronicles-drivenbydesign-docs.azurewebsites.net).

The documentation site includes:

- **Getting Started** — prerequisites, installation, running the project
- **Architecture** — system design with diagrams (backend, frontend, database ERD, use case diagrams), and authentication & Azure configuration
- **API Reference** — full endpoint documentation with request/response examples
- **Development** — contributing guide, testing strategy, deployment
- **Methodology** — project methodology (Scrumban), Git workflow, sprint meetings, sprint review, and potential risks

### Building docs locally

```bash
pip install -r docs/requirements.txt
python -m mkdocs build        # Build to site/
python -m mkdocs serve        # Live preview at http://localhost:8001
```

## Status

🚧 In development.

## AI Usage

This repository makes use of AI code generation using the following tools: Qoder.
This repository makes use of AI in-line editing using the following tools: Qoder.
This repository makes use of AI code-review using the following tools: Qoder.
