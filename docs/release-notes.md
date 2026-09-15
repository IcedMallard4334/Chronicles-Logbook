# Release Notes

## v0.2.0 — Milestone 2 (Sprint 2) · 15 September 2026

The intermediate tier. Chronicles now adapts to how you work rather than the
other way round: your fields can be richer, your format can change without
losing what you already wrote, your statistics follow whatever fields you
define, and the record goes where you go — including offline and out of the
platform entirely.

### New

**Richer fields.** Five new field types when you define a project's format:

- **Tags** — group related work across projects, and filter the entry list by them.
- **Checklists** — sub-tasks inside an entry, with the `3/5` count shown on the preview so you can see progress without opening it.
- **Entry links** — point one entry at another. Links are visible from both ends, and deleting an entry clears any that pointed at it rather than leaving them broken.
- **Project links** — reference another of your projects.
- **Calculations** — a value worked out from the number fields beside it, updated as you type and never asked for.

**Change your format without losing your history.** Edit a field's name or
type, add a field, or remove one, and existing entries come with you. Before a
change is applied you are shown exactly what it will do to entries already
written. A removed field's values are kept, not destroyed; every entry
remembers the format it was written in, so an old entry still reads correctly
after the format has moved on.

**Statistics for whatever you defined.** Any number field can be totalled and
averaged; any choice field grouped and counted; any field plotted over a date
range. The logbook now also reports your **streak** — the run of consecutive
days you have kept it up — alongside your longest ever.

**More ways to see your entries.** Saved filters you can name and come back
to; a calendar; a board grouped by any field, with entries you can drag
between columns; and an Outstanding view of what still needs doing, ordered by
due date.

**Works without a connection.** Entries captured offline are queued and sent
when you are back online. Anything the server refuses is shown to you rather
than silently dropped.

**Your record is yours.** Export everything as documented JSON, or a project
as CSV, and import it back — projects, formats and entries restored.

**Share a project.** Invite another Chronicles account by email. They can read
the project and add entries and tasks; only you can change its format, archive
or delete it, export it, or share it further. Every entry and task now records
who wrote it and who completed it.

**Meet Mira.** An in-app assistant that can answer questions about your
logbook and propose actions — such as creating a project — which it never
carries out without your confirmation. Mira asks for your consent before it
reads anything.

**A public API.** Every operation the app performs is available over a
documented HTTP API, with live Swagger documentation at the deployed address.

**Google Calendar.** Connect your calendar to see your events alongside your
entries.

**Delete a project.** Archiving remains the ordinary way to finish with one;
deletion is now there for a project that should never have existed, and asks
for the project's name back before it acts.

### Improved

- **Your chosen colours now apply everywhere.** Highlights, buttons, the
  selected day and the active tab had all ignored the accent you picked.
- **Sign in with Google only.** Password sign-in has been removed; Google
  handles your password and its recovery.
- **The account menu does what it says.** Search now opens the command palette
  (<kbd>Ctrl</kbd>/<kbd>⌘</kbd>+<kbd>K</kbd>); entries that did nothing are
  gone; your Google profile photo is shown.
- **Usable on a phone.** Navigation keeps its labels, controls are
  thumb-sized, and nothing hides behind the floating buttons.
- **Entries and Tasks explain themselves** against each other — the one thing
  more than half of surveyed users found unclear.
- **A link that was never pointed anywhere** now says so, rather than
  claiming its target was deleted.

### Fixed

- Every project endpoint returned an error after a deployment because the
  database was missing columns the app expected. The cause — deployments never
  applying schema changes to existing tables — is fixed, and a test now
  prevents it recurring.
- The tags, checklist and entry-link editors had been built but never
  connected to the form, which showed a plain text box instead.
- The profile page's back button rendered as an empty space on phones.
- Two tests failed at random, on timing rather than on anything wrong.

### Known limitations

Recorded rather than hidden; each is a candidate for Milestone 3.

- **Quick-capture pre-fill is partial.** The new-entry form is one keystroke
  away, but only calculated fields are filled in for you.
- **A collaborator cannot leave a project** — only the owner can withdraw
  access.
- **Statistics and export remain the owner's.** A collaborator sees the
  project and its entries but not its statistics page or export.
- **Sharing has no roles.** Everyone a project is shared with gets the same
  access.
- **No reminders yet.** The most-requested feature from user feedback,
  deliberately deferred until it can be built with scheduling designed in.

### For those deploying it

- **No manual database step.** The new `project_members` and `mira_consents`
  tables are created on startup, and the new columns on `entries` and `tasks`
  are added by the startup patch. If you have applied earlier migrations by
  hand, nothing further is needed.
- `CORS_ORIGINS` must list the frontend's origin; the default covers local
  development only.
- The documentation site's deploy requires `AZURE_DOCS_PUBLISH_PROFILE` to be
  the publish profile pasted verbatim — a lost character produces invalid XML,
  and the workflow now reports that as one line.
- Backend test coverage is now measured correctly (`concurrency = greenlet`).
  If you compare against earlier figures, the earlier ones were under-reported.

**Tests:** 332 backend, 330 frontend. **Backend coverage:** 94%.

---

## v0.1.0 — Milestone 1 (Sprint 1) · 25 August 2026

The basic tier: projects with a format of your own choosing, quick entry
capture with time tracking, tasks with checklists, search, a timeline, and the
first statistics. Google sign-in, a deployed API and frontend on Azure, and
the documentation site.

Seventeen of twenty stories; quick capture and full statistics carried into
Sprint 2, where both were completed.

AI Declaration: The preceding document was generated with: Claude Code [Claude Opus 5]
