# Chronicles — Digital Logbook

A customisable digital logbook that lets students track project work without the friction of a physical notebook. Unlike a fixed-schema tracker, every project owner defines their own entry format — field names, types, and structure — and the entire system adapts to whatever shape they choose.

## Core Idea

The schema is **user-defined**, not hardcoded. Entries, statistics, filters, and dashboards all operate generically over fields the platform doesn't know about until the user creates them.

## Key Features

- **Custom entry schemas** — define fields with text, number, date, dropdown, project-reference, and computed types per project
- **Editable schemas** — change a project's fields after it has entries, with a preview of what the change does to them before it is applied
- **Quick capture** — log entries in seconds with pre-filled fields
- **Time tracking** — record time spent per entry, aggregated per project
- **Task tracking** — manage to-do items with due dates and checklists per project
- **Task checklists** — break tasks into sub-steps with progress tracking
- **Project management** — create, describe, and archive/unarchive projects
- **Timeline view** — browse entries chronologically
- **Search and filter** — find entries across all projects
- **Statistics** — time per project, entry counts, and streak tracking
- **Dark mode** — light, dark, and system themes via CSS custom properties
- **Profile page** — account details, theme switcher, sign-out, delete account
- **Google OAuth** — sign in with your Google account
- **Responsive design** — adapts to desktop and mobile viewports

## Tech Stack

| Layer | Technology | Motivation |
|---|---|---|
| Frontend | React 19 + Vite 8 + React Router | Mature component model for schema-driven forms; Vite for fast HMR and builds; React Router for clean URLs and auth redirects |
| Backend | FastAPI (Python 3.12) | First-class async support, automatic OpenAPI docs, Pydantic-native validation; chosen over Flask/Django for async + auto-docs |
| Database | PostgreSQL 15+ with JSONB | JSONB lets us store user-defined entry fields flexibly; chosen over SQLite/Firebase to keep API hand-written per project brief |
| Authentication | Google OAuth 2.0 (Authlib) + JWT | Eliminates password storage/security burden; Google OpenID Connect provides verified emails; JWT issued server-side after OAuth exchange |
| Hosting | Azure App Service + Azure Web Apps | Non-monolithic split satisfying project requirement; consolidated on one platform for simpler credential management |
| Database hosting | Azure Database for PostgreSQL Flexible Server | Managed PostgreSQL with SSL, backups, and scaling; avoids App Service filesystem persistence limits |
| CI/CD | Gitea Actions | Chosen because repository is self-hosted on Gitea; lint/test/build on PRs, auto-deploy on merge |
| Documentation | MkDocs + Material for MkDocs | Markdown-first authoring, built-in search, Mermaid diagram support without a JS build step |
| Work tracking | Gitea Projects (Kanban) | User stories as board items with acceptance criteria and checklists; pull-based workflow with WIP limits |
| Testing | pytest + Vitest | pytest-asyncio for async backend tests; Vitest for React component tests with jsdom |

## Quick Start

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

## Documentation

| Section | Description |
|---|---|
| [Getting Started](getting-started/prerequisites.md) | Prerequisites, installation, running the project |
| [Architecture](architecture/overview.md) | System design, backend, frontend, database with diagrams |
| [API Reference](api/authentication.md) | Full endpoint documentation with examples |
| [Development](development/contributing.md) | Contributing guide, testing, deployment |
| [Methodology](methodology/project-methodology.md) | Project and Git methodology documentation |

## Team

Driven by Design — COMS3011A, University of the Witwatersrand.

AI Declaration: The preceding document was reviewed and edited with: Qoder
