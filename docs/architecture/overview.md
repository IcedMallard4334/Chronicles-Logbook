# Architecture Overview

Chronicles follows a **non-monolithic architecture** with a clear separation between the backend API and the frontend client.

```
┌─────────────────┐       ┌──────────────────┐       ┌─────────────┐
│    Frontend      │──────▶│    Backend API    │──────▶│  PostgreSQL  │
│  React + Vite    │  REST  │   FastAPI        │ async  │   + JSONB    │
│  Port 5173       │◀──────│   Port 8000      │◀──────│              │
└─────────────────┘       └──────────────────┘       └─────────────┘
        │                         │
        │                         ├── Google OAuth (Authlib)
        │                         ├── JWT tokens (PyJWT)
        │                         └── Async ORM (SQLAlchemy)
        │
        ├── Vite dev server
        ├── Vitest (testing)
        └── oxlint (linting)
```

## Design principles

1. **User-defined schemas** — the platform never hardcodes field names. Entries store data in JSONB columns and all queries, filters, and statistics operate generically over user-defined fields.
2. **Non-monolithic** — the backend and frontend are separate services with a hand-written REST API. They can be deployed, tested, and scaled independently.
3. **Async-first** — the backend uses `async`/`await` throughout (FastAPI + async SQLAlchemy + asyncpg) for better concurrency under load.
4. **Trunk-based development** — all contributors work on feature branches and merge via pull requests into `main`.

## Repository structure

```
Chronicles/
├── .gitea/                    # CI/CD workflows
├── chronicles-logbook/
│   ├── backend/               # FastAPI application
│   │   ├── app/
│   │   │   ├── routers/       # API endpoint modules
│   │   │   ├── models.py      # SQLAlchemy ORM models
│   │   │   ├── schemas.py     # Pydantic request/response schemas
│   │   │   ├── database.py    # Engine, session, base class
│   │   │   ├── security.py    # JWT creation and validation
│   │   │   └── config.py      # Environment variable loading
│   │   ├── tests/             # pytest test suite
│   │   ├── main.py            # App entry point and router registration
│   │   └── requirements.txt   # Python dependencies
│   └── frontend/              # React + Vite application
│       └── src/
│           ├── App.jsx        # Main app component (auth, routing, UI)
│           ├── api.js         # HTTP client for backend
│           ├── App.css        # Component styles
│           ├── index.css      # Global styles and CSS variables
│           └── ...
└── mkdocs.yml                 # Documentation site configuration
```
