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

## Tech stack

- **Frontend:** React
- **Storage:** SQLite

## Status

🚧 In development.

## AI Declaration

Project specification generated with Claude Code (Claude Opus 4.8), per course requirements.