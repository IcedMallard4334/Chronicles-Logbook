# Chronicles — Digital Logbook

A customisable digital logbook that lets students track project work without the friction of a physical notebook. Unlike a fixed-schema tracker, every project owner defines their own entry format — field names, types, and structure — and the entire system adapts to whatever shape they choose.

## Core Idea

The schema is **user-defined**, not hardcoded. Entries, statistics, filters, and dashboards all operate generically over fields the platform doesn't know about until the user creates them.

## Key Features

**Core (Sprint 1)**

- **Custom entry schemas** — define fields with text, number, date, dropdown, tags, checklist, entry link, project link, and computed types per project
- **Editable schemas** — change a project's fields after it has entries, with a preview of what the change does to them before it is applied; retired fields keep their recorded values rather than losing them
- **Quick capture** — log entries in seconds with pre-filled fields
- **Time tracking** — record time spent per entry, aggregated per project
- **Task tracking** — manage to-do items with due dates and checklists per project
- **Project management** — create, describe, and archive/unarchive projects
- **Google OAuth** — sign in with your Google account, no separate password
- **Dark mode** — light, dark, system theme, plus four accent colours, each with its own themed animated background

**Sprint 2**

- **Structured search** — AND/OR conditions over a project's own fields, with per-field-type operators and a "best match" relevance sort
- **Saved filters** — name and re-apply a whole search (keyword, project, status, conditions, sort) as one click
- **Sharing and collaboration** — invite another account to a project by email; owners and members have distinct permissions
- **Offline capture and sync** — entries captured offline queue locally and sync automatically once reconnected, with a rejected-entry recovery flow
- **Data export/import** — a full account JSON export/import, and a per-project CSV export via the API
- **Board and Calendar views** — entries grouped by a Choice field with drag-and-drop; a month calendar combining entries, deadlines and (optionally) Google Calendar
- **Command palette** — `Ctrl`/`Cmd`+`K` quick navigation across pages, commands and projects
- **In-app help manual and guided tour** — a searchable manual plus a one-time welcome tour and per-page coach marks
- **Mira** — a Google Gemini-backed assistant that can do what you can do by hand (projects, schemas, tasks, reminders, activities and more), always with your confirmation, consent-gated and otherwise fully optional
- **Progress** — daily login and activity streaks, and 34 achievement badges with confetti celebrations, shown on your profile

**Sprint 3**

- **Automation** — rules that tag, fill in a field, or flag an entry as to-do automatically when it's saved, matched against project-defined conditions
- **Recurring entries and reminders** — entries that repeat on a schedule, and an in-app bell listing everything overdue, due today or coming up
- **Entry history** — every edit keeps the entry's previous values as a numbered, timestamped revision, viewable (not yet restorable) from the entry itself
- **Customisable Dashboard** — a workspace-wide, user-arranged panel layout (US-3.9)
- **Statistics page** — workspace-wide and per-project field totals, groupings and charts, separate from the per-entry timeline
- **Activity view** — every entry across every project in one searchable, filterable, chronological list, with a "Field trends" view plotting one field over time
- **Accessibility pass (US-3.19)** — Lighthouse Accessibility 100/100; semantic roles, keyboard focus management, and screen-reader-visible status indicators throughout, see [External Services & Integrations](api/external-services.md) and [User Feedback — Sprint 3](methodology/user-feedback-sprint-3.md)
- **Performance pass (US-3.17)** — Lighthouse Performance 69 → 95, see [API Performance, Load & Robustness](testing/api-performance.md)
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
| [API Reference](api/overview.md) | Our own API endpoints, plus the external APIs (Google OAuth, Calendar, Gemini) we consume |
| [Development](development/contributing.md) | Contributing guide, testing, deployment |
| [Testing](testing/api-performance.md) | Load, latency, robustness and Lighthouse performance evidence |
| [Methodology](methodology/project-methodology.md) | Project and Git methodology, sprint meetings, user feedback |

## Team

Driven by Design — COMS3011A, University of the Witwatersrand.

AI Declaration: The preceding document was reviewed and edited with: Qoder.
The Sprint 3 features list and documentation table above were added with
Claude Code (Sonnet 5).
