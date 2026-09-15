# Sprint 2 Review

## Summary

| Metric | Value |
|---|---|
| **Sprint** | 2 |
| **Dates** | 2026-08-26 to 2026-09-15 |
| **Planned user stories** | 20 intermediate-tier (US-2.1 – US-2.20) + 3 carried from Sprint 1 (US12, US13, US18) |
| **Completed** | 22 |
| **Partially complete** | 1 (US13 — the pre-fill half) |
| **Completion rate** | 96% |
| **Tier achieved** | Intermediate |
| **Automated tests** | 332 backend, 330 frontend |
| **Backend line coverage** | 94% (Sprint 1 badge showed 74% — see *Measurement* below) |
| **External integrations** | Google Calendar API, Google Gemini |
| **User feedback** | Google Form, 12 respondents, 3 changes made, 4 requests declined with reasons |

The team completed the intermediate tier as defined in the Sprint 2 planning
document: rich fields, schema editing that carries existing entries with it,
format-aware statistics, multiple views, offline capture and portability, an
externally available documented API, and the AI assistant. Beyond the plan,
the sprint also delivered project sharing with per-entry authorship, project
deletion, a consent flow for the assistant, and a phone-usable layout.

The sprint ran with the WIP limit and informal standups agreed at the Sprint 1
retrospective, four documented meetings including a Product Owner review, and
a formal user-feedback round whose results changed the product before the
sprint closed.

### Key decisions during the sprint

- **Meeting 1 (2026-08-26):** Every recorded decision carries a rationale from
  here on — the Milestone 1 marking's most sweeping point. Testing effort gets
  its own tracker column.
- **Meeting 2 (2026-09-02):** Usability treated as delivery work, not polish,
  after a full walkthrough showed a feature-complete app that was hard to use.
- **Meeting 3 (2026-09-11):** A single merge owner (Nkosinathi) for the rest
  of the sprint, after six unmerged branches left the team unable to see the
  integrated app. User feedback scheduled *after* development so the fixes it
  drives land on the real product.
- **Meeting 4 (2026-09-14):** PO review. Statistics and export confirmed as
  must-work for the presentation; terms and conditions required for the
  assistant; every tool to be justified; project sharing adopted as a feature
  — with the clarification that it is not an external API integration and
  that requirement was already met.
- **2026-09-14:** Production outage traced to database columns present in the
  models and absent from the deployed database (see *Incidents*). Fixed the
  same day, with a test that prevents recurrence.

## Completed User Stories

### Rich fields (Person 1, Person 2)

| Story | Title | Evidence |
|---|---|---|
| US-2.1 | Tag entries | `tags` field type; tag editor; `GET /entries?tag=` filter |
| US-2.2 | Checklists in an entry | Add, tick, reorder, delete; `n/m` count on the entry preview |
| US-2.3 | Link entries together | `link` field; `GET …/entries/{id}/links` returns backlinks; deleting an entry clears links to it |
| US-2.4 | Reference between projects | `project_reference` field; target validated as an existing project the owner holds |
| US-2.5 | Computed fields | Expression over same-entry numeric fields; read-only in the form; recomputed as you type |

A note on US-2.1 – US-2.3: the three editors were built early in the sprint and
then never wired into the entry form — the form rendered `<input type="tags">`,
which browsers silently downgrade to a text box. This was found in the
2026-09-14 review and fixed the same day. The story was "complete" by the
board and not by the product for roughly two weeks, which is discussed in
*What the sprint taught us*.

### Schema editing and migration (Person 2, Person 3)

| Story | Title | Evidence |
|---|---|---|
| US-2.6 | Edit an existing schema field | Edit mode with preview-before-apply; `POST …/schema/preview` reports what each change costs in entries |
| US-2.7 | Add or remove a field from a live schema | New fields backfilled; removed fields kept in `retired_schema` / `retired_data` rather than destroyed |
| US-2.8 | Preserve history across format changes | `projects.schema_version`; every entry stores `schema_version` and a `schema_snapshot` of the shape it was written against |
| US-2.9 | Hide the schema editor by default | Read-only summary until "Edit schema" is chosen; exiting returns to the entry view |

### Format-aware statistics (Person 3)

| Story | Title | Evidence |
|---|---|---|
| US-2.10 | Total and group by any field | Statistics view: choosing a project totals and averages every number field and groups and counts every choice or tag field, respecting each entry's schema version. Backed by `GET /statistics/projects/{id}/fields` |
| US-2.11 | Plot any field over time | Same view: choose a field and date range; charted with Recharts. Backed by `GET …/fields/{field}/timeline` |

A note on US-2.10, in the same spirit as the one on the rich fields above: the
endpoint was built, tested, and documented — and until 2026-09-15 had **no
interface**. No screen called it; an owner could not total or group by a field
anywhere in the app. The first draft of this very review marked the story
complete on the strength of the endpoint, which is the mistake *What the sprint
taught us* describes. The statistics view (formerly the sidebar's "Activity"
button, now labelled Statistics and reachable from the command palette) was
added the same day. Acceptance criteria are met by the product or not at all.
| US18 *(carried)* | Statistics | Overall and per-project totals, time, active days — and, added 2026-09-15, the current and longest **streak**, which the base tier names ("where a run of days has been kept up") and which had been a placeholder |

### Multiple views (Person 4)

| Story | Title | Evidence |
|---|---|---|
| US-2.12 | Saved filters | Named, persisted server-side, re-applied from a bar above the entries |
| US-2.13 | Calendar view | Entries on the day they were logged; a day opens its entries |
| US-2.14 | Board grouped by a field | Column field chosen by the owner; drag between columns updates the entry |
| US-2.15 | Unfinished work with due dates | `todo` and `due_date` on entries; Outstanding view sorted by due date |

### Offline, portability and cross-cutting (Person 5)

| Story | Title | Evidence |
|---|---|---|
| US-2.16 | Capture entries offline | IndexedDB queue; automatic sync on reconnect; rejected entries surfaced for attention rather than dropped |
| US-2.17 | Export and re-import | JSON export documented on the site; CSV per project; import restores projects, schemas and entries idempotently |
| US-2.18 | API access | 50+ operations; Swagger UI and OpenAPI spec live at the deployed API; hand-written reference on the docs site |
| US-2.19 | Automated tests for core flows | Schema create/edit, entry CRUD and statistics all covered; suites run in CI on every push and PR |

### AI assistant (Person 6)

| Story | Title | Evidence |
|---|---|---|
| US-2.20 | AI assistant chatbot | Mira: in-app widget, `/ai/chat` endpoint, Gemini; proposes actions such as creating a project and never executes them without confirmation. Consent onboarding added after the PO review (`/ai/consent`) |

### Carried from Sprint 1

| Story | Title | Status |
|---|---|---|
| US12 | Quick capture | **Complete** — command palette (`Ctrl`+`K`) reaches any project or page; entry form opens on the project |
| US13 | Quick capture with pre-fill | **Partial** — the form is one keystroke away, but "anything predictable already filled in" is only true of computed fields. Carried to Sprint 3 |
| US18 | Statistics | **Complete** — see above |

### Delivered beyond the plan

| Feature | Why it was worth the sprint's time |
|---|---|
| Project sharing (US-2.21) | The PO's request at Meeting 4. Owner shares by email; collaborators read and add entries and tasks; owner alone reshapes or removes. Sixteen tests |
| Authorship on entries and tasks | A shared logbook that records what was done but not who did it is only half a record |
| Project deletion | The one CRUD gap; archive remains the ordinary path, and deletion asks for the project's name back |
| Mira consent onboarding | PO decision D-006: an assistant that reads a personal record needs informed consent first |
| Phone-usable layout | Verified by rendering at 390px, not by reading CSS: nav labels restored, floating controls separated, content no longer hidden behind them |
| Theme and accent applied everywhere | Highlights, buttons and the avatar had ignored the chosen accent because the CSS variables they asked for were never defined |

## Incomplete User Stories

| Story | Title | What remains | Carried to |
|---|---|---|---|
| US13 | Quick capture pre-fill | Pre-filling predictable fields (last-used values, today's date) on the new-entry form | Sprint 3 |

## Incidents

**2026-09-14 — production 500s on every project endpoint.** Five columns
existed in the models and not in the deployed database. `create_all()` builds
missing tables but never adds columns to existing ones, and the deploy pipeline
does not run the `migrations/` folder, so the startup column patch was the only
thing reaching production — and it listed two columns while the migrations add
nine. Two feature branches had each numbered their migration `004`, which is how
the second was overlooked in the merge. Fixed the same day by completing the
list and adding a test that fails if a migration ever adds a column the list
omits, so the drift is caught in CI rather than in production. Recorded in
full on the [Deployment](../development/deployment.md) page.

**Docs deployment red from 2026-09-14.** The Azure publish-profile secret for
the documentation site was pasted with a character lost, producing invalid XML.
The workflow now reports this as one actionable line instead of dumping the
profile into the build log; the secret itself has to be re-pasted from the
Azure portal.

## Measurement

Backend coverage was reported at **74%** for most of the sprint and was wrong.
SQLAlchemy's asyncio layer runs inside greenlet switches, which `coverage.py`
does not trace unless told to, so every endpoint line after an `await` was
recorded as unexecuted. `statistics.py` read 23% while seventeen tests were
calling its endpoints. One configuration line took the figure to **93%** with
no new tests; real gaps were then closed to 94%. The lesson — that a
measurement can be wrong, and a number far below what the tests visibly do is
a reason to check the instrument — is on the [Testing](../development/testing.md)
page, alongside a test that passed while proving nothing until coverage
exposed it.

## User Feedback

Twelve first-time users, via Google Form, on 2026-09-14. The headline: **58%
could not tell Entries from Tasks apart**, the only majority-negative result,
traced to page descriptions that never mentioned each other and fixed the same
day. Three requested features already existed, making discoverability rather
than feature count the next thing to work on. Push notifications, tutorial
videos and a home-screen redesign were declined with reasons. Full analysis on
the [User Feedback](user-feedback.md) page.

## What the sprint taught us

1. **A story can be done on the board and absent from the product.** The rich
   field editors existed, had tests, and were never reachable. Acceptance
   criteria need to be checked *in the running app*, by someone other than the
   author, before a card moves.
2. **The deploy is part of the feature.** Three of the sprint's four incidents
   were deployment, not code: the schema drift, the docs secret, and the
   coverage number. None would have been caught by more unit tests.
3. **Users ask for what they cannot find.** Dark mode, search and offline
   capture were all requested by someone who was using an app that had all
   three. The next feedback round should ask people to *find* a named feature.
4. **Merges need review as much as commits do.** The duplicate migration
   number was invisible to the commit convention and would have been obvious
   to anyone reading the merge.

## Retrospective Actions

| Action | Owner | Status |
|---|---|---|
| Re-paste the docs publish-profile secret and confirm the deploy job is green | Nkosinathi | Open |
| Rotate the Gemini API key committed in history | Nkosinathi | Open |
| Acceptance criteria verified in the running app by a second person before a card closes | All | Sprint 3 |
| Review merges, not only commits — check for duplicate migration numbers | Merge owner | Sprint 3 |
| Complete US13 pre-fill | Ethan | Sprint 3 |
| Second user-feedback round asking participants to *find* named features | Victor | Sprint 3 |
| Measure page load against a realistically sized logbook before optimising anything | Nkosinathi | Sprint 3 |
| Write down the CI/CD knowledge so the Scrum Master role can rotate | Nkosinathi | Sprint 3 |
| Remove the seven unused frontend dependencies (lockfile regeneration) | Athalia | Sprint 3 |

## Sprint 3 Planning

Sprint 3 (2026-09-16 to 2026-09-29) is 14 days against Sprint 2's 21, and
overlaps the CGV project. Capacity is planned accordingly.

Priorities, in order:

1. **Close the open incidents** — docs deploy green, key rotated.
2. **Advanced tier, narrowest first** — a custom statistic written as an
   expression over entries (the brief's "hardest part"), building on the
   computed-field expression engine that already exists.
3. **US13 pre-fill** and the discoverability round of user feedback.
4. **Reminders** — the most-requested declined feature, now with the
   scheduling design it needs rather than a half-built version.
5. **Performance measurement**, then optimisation only where the numbers say
   to.

AI Declaration: The preceding document was generated with: Claude Code [Claude Opus 5]
