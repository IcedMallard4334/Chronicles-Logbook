# Chronicles: final release notes

COMS3011A Project 7, Milestone 4. Branch `feat/learning-chronicles`, 10 October 2026.

Chronicles is a digital logbook for students. The idea that runs through all of it is that **the person defines the
shape of their own records**. Each project has its own fields, and entries, search, statistics, filters and
dashboards all work over fields the platform did not know about until the person made them.

---

## What is in the app

### Your logbook, your format

- **Custom entry schemas.** Per project, fields of ten types: short text, long text, number, date, choice, tags,
  checklist, entry link, project link and calculation.
- **Editable schemas.** Change a project's fields after it has entries. A preview shows what the change does to them
  before it is applied. A removed field is retired, not deleted, so recorded values are never lost.
- **Quick capture.** Log an entry in seconds, with time spent per entry added up per project. Titles are required
  when logging in the app.
- **Statuses.** Each project has 2 to 8 ordered statuses, each marked finished or not. The Board has a column for each.
- **Entry history.** Every edit keeps the previous values as a numbered, timestamped version. Any version can be
  restored, and a deleted entry can be brought back.
- **Tasks.** To-dos with due dates and times, and checklists, per project.
- **Planned work and time caps.** Planned (still to do) entries need fewer fields than finished ones. The
  10,000-hour ceiling applies to new figures only, so old entries keep their recorded time.

### Finding and understanding your work

- **Structured search.** AND/OR conditions over a project's own fields, with operators suited to each field type and
  a "best match" ordering.
- **Saved filters.** Name a whole search and re-apply it in one click.
- **Activity view.** Every entry across every project in one searchable, filterable list, plus a "Field trends" chart
  of one field over time.
- **Statistics page.** Workspace-wide and per-project totals, groupings and charts.
- **Customisable dashboard.** Choose how many blocks across (2 to 6), size and drag panels, and add panels for
  statistics, saved filters, boards, projects and badges.
- **Board and Calendar.** A Board with a column per status, and a month Calendar that combines entries, deadlines,
  scheduled activities and, optionally, Google Calendar.

### Working with other people

- **Sharing by invitation.** Invite an account by email. Nothing is granted until they accept, and they can decline.
  Owners reshape the project. Members add entries and tasks and edit only what they wrote.
- **Project team.** A **Team** pill shows who is working on a project and what each person has done: entries logged,
  completed and edited, tasks, time logged and schema changes. A **Recent activity** feed sits alongside. Every figure
  is counted from stored work, not from separate counters.
- **Invitation notices.** The owner is told when an invitation is answered, and can dismiss it.
- **Logged by filter.** Narrow a project's entries to one person.
- **Project notes.** A **Notes** tab for what does not fit an entry. Each note is **private** (only its author, not
  even the owner) or **shared** with the project, which shows the author's name, avatar and a colour that is the same
  for each person. Pin, edit and delete your own notes, search by text or author, and the owner can delete a shared
  note.

### Automation

- **Rules.** Tag an entry, fill in a field or flag it as to-do automatically when it is saved or its status changes.
- **Recurring entries and reminders.** Entries that repeat on a schedule, and a bell listing everything overdue, due
  today or coming up.

### Mira, the assistant

- Backed by Google Gemini, optional and consent-gated. Mira can do what you can do by hand: projects, schemas,
  entries, tasks, reminders, activities, rules, sharing, statistics and navigation.
- Always with your confirmation. There is an opt-in fast path for people who prefer it.
- Replies stream and render Markdown. Conversations are saved and can be reopened. **Voice dictation** is built in.
- Reworked after the lecturer's feedback to act first, show what changed, then check.

### Staying motivated

- **Streaks.** A daily login streak and a daily activity streak.
- **34 achievement badges** in seven areas, with celebrations and a profile showcase.

### Getting started

- A landing page for visitors, a **Learning Chronicles** guide with walkthrough videos, an in-app searchable help
  manual, a one-time welcome tour and per-page hints.
- **Import and export.** A full-account JSON backup and restore, a per-project CSV, and CSV import with a preview.
  Nothing is added until you confirm.

### Look and feel

- Light, dark or system theme, accent colours with themed animated backgrounds, and a custom-colour mode.
- A phone layout of its own below 720px: a bottom bar, a **More** sheet and folding panels.
- A non-modal side drawer that pushes the page when there is room and overlays it when there is not.
- **Our own tooltips and our own confirmation dialog.** The browser's plain pop-ups are replaced everywhere they can be.
  A few tooltips remain the browser's own, where a custom one would be clipped (decision UI-71).

### Offline and reliability

- Entries captured offline queue on the device and sync when the connection returns, with a recovery flow for any the
  server refuses.

### Sign-in

- Google OAuth only, so there is no password to store. The server issues its own session after the Google exchange.

### The API

- A hand-written REST API (FastAPI) with generated OpenAPI documentation at `/docs` and `/openapi.json`.
- **Four endpoints need no sign-in:** `/health`, `/public/info`, `/public/field-types` and `/public/limits`. They
  describe the API, the field types and the limits, and hold nobody's data. Everything else is scoped to the person
  signed in.
- Every endpoint is documented, and a script (`scripts/docs_audit.py`) checks the docs against the running code.

---

## In this last stretch (9 to 10 October)

- **New:** project notes (private or shared, searchable), the project team view with an activity feed, owner notices for
  answered invitations, the "Logged by" filter, and the public reference API.
- **Improved:** themed tooltips and an in-app confirm dialog in place of browser pop-ups; number fields in entry cards
  line up on the left; the project header no longer squeezes the name when five tabs are shown.
- **Fixed:** deleting a project now also removes its notes and schema-change records; accessibility findings from a
  hand scan of the new screens (dark-theme red at 4.42:1, small touch targets, heading structure).
- **Documented:** every design decision, with its reason, is in the decision log: DB-01 to DB-70 (data and backend),
  UI-01 to UI-71 (interface), PL-01 to PL-22 (platform and delivery), and N-01 to N-17 (what the tests do not cover,
  and why). Diagrams include a full entity-relationship diagram, class, sequence, activity, state, architecture and an
  API map, and all of them parse.

---

## Quality

| | |
|---|---|
| Backend tests | 800 passing, about 95% statement coverage (target above 90%) |
| Frontend tests | 1,021 passing, 84.9% statement coverage (target above 80%) |
| Lint | ruff and oxlint clean (oxlint has one harmless warning about exporting a constant from a component file) |
| Docs | The docs audit reports that routes, tables, migrations and settings all match the documentation |
| Accessibility | Landing page Lighthouse 98 / 100 / 96 / 100 (performance, accessibility, best practices, SEO). The signed-in app was scanned by hand with axe-core on every main screen in light, dark and phone width, and findings were fixed |

---

## Upgrade notes

- **New tables, created on startup:** `project_schema_changes` (migration 023) and `project_notes` (migration 025).
  `project_members.owner_seen_at` (migration 024) is added by the startup patch. Nothing existing is altered or
  removed. The `.sql` files record the exact definitions for reviewers.
- The app does not use a migration tool. It creates missing tables and adds missing columns on start, as recorded in
  decisions DB-51 and DB-52 and the migrations page.

---

## Known limits

- **Accessibility scans are manual,** done in a browser, and are not part of CI. A real phone, a screen-reader
  walk-through and a user test of the colours were not done.
- **Coverage is not enforced by CI.** The targets are met, but there is no fail-under rule.
- **Notes** are not searchable across projects and do not appear in the statistics.
- **Schema-change history** starts on 9 October. Earlier changes are not known and are not invented.
- **"Logged by"** is on a project's entries but not on the All Entries page, which is paged by the server.
- **In the activity feed,** a completed task's time is its last-updated time, which is approximate.
- **The plain red text button** elsewhere in the app has the same 4.42:1 contrast on the dark theme that was fixed on
  the Notes tab and in the confirmation dialog.
- **Not verified, and worth doing before the 11th:** the deployed site from a cold start, production data, Mira
  against the real Gemini key, and whether the leaked key from 14 September was rotated (the record does not say).
