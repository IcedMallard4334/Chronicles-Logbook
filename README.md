# Chronicles

A customisable digital logbook that lets students track project work without the friction (or forgetfulness) of a physical notebook. Unlike a fixed-schema tracker, every project owner defines their own entry format — field names, types, and structure — and the entire system (capture, statistics, views, search) adapts to whatever shape they choose, rather than the other way around.

## Core idea

The schema is user-defined, not hardcoded. Entries, statistics, filters, and dashboards all operate generically over fields the platform doesn't know about until the user creates them. This is the core design constraint that everything else is built against.

## Features

### Basic
- User-defined entry schemas — an owner chooses the fields and types for each project independently
- Quick capture, keyboard-first, with predictable fields pre-filled
- Projects can be created, described, and archived
- Entries carry time spent, which accumulates against their project
- Built-in stats: time per project, entries over a week/term, streak tracking
- Timeline browsing, full-text search, and per-project filtering

### Intermediate
- Richer fields: tags, checklists, links between entries, references between projects, computed/derived fields
- Schema migrations — changing a format carries existing entries forward (backfilling what it can) without breaking older versions
- Generic statistics: total, group by, compare, and plot any user-defined field
- Multiple entry views: saved filters, calendar, and boards grouped by any field
- Todo/unfinished-work tracking with due dates
- Offline capture with sync once connected
- Export/import in a platform-independent, human-readable format

### Advanced
- User-defined custom statistics — owners write and save their own expressions over their data
- Persistent, arrangeable dashboards built from built-in and custom stats
- Full entry history/versioning — corrections preserve what they replaced, with point-in-time recall and rollback
- Structured search over custom fields with combined filters and ranking
- Automation: rules on capture, recurring entries, self-generated reminders
- Performance at scale: fast queries over long records, with old entries archived rather than in the way


### Tech Stack

- **Frontend:** React — component-based structure suits our schema-driven UI (forms, timelines, and stats views all render dynamically from user-defined fields).
- **Backend:** FastAPI (Python) — hand-written REST API with async support, and built-in OpenAPI/Swagger docs for easy testing and documentation.
- **Database:** Azure Database for PostgreSQL (Flexible Server) — chosen over SQLite to avoid App Service's filesystem persistence limitations, and over Firebase/Firestore to keep our API genuinely hand-written per the project brief. PostgreSQL's JSONB column type also lets us store user-defined entry fields flexibly alongside strongly-typed core fields (project, date, time).
- **Authentication:** Google OAuth (Sign in with Google), implemented via Authlib. Delegates credential security to Google rather than hand-rolling password storage, satisfying the brief's requirement to rely on an established auth practice/library.
- **External Integration:**
  - **GitHub API** — students can link a project to a GitHub repo and pull recent commits, using commit messages to pre-fill or suggest logbook entries (ties directly into our Quick Capture feature).
  - **Google Calendar API** — outstanding tasks (with due dates) can sync to the student's calendar, so unfinished work surfaces outside the app too.
- **Hosting:** Azure App Service (backend) + Azure Web Apps (frontend) — a non-monolithic split satisfying the key project requirement, consolidated on one platform for simpler credential and cost management across the team.
- **CI/CD:** Gitea Actions — lint/test/build on every PR, automatic deploy to Azure on merge to main.

## Status

🚧 In development.

## AI Declaration

Project specification generated with Claude Code (Claude Opus 4.8), per course requirements.