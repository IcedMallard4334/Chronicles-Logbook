# Decisions: data and backend

Each entry says **what was decided**, **why**, **what it costs or what was rejected**, and **where it
lives**. Where the repository does not record why something was done, that is stated rather than
guessed. How the log works, and how to add to it, is on the [index](index.md).

Sources are the code comments, commit messages and existing documents. Entries that were already
argued at length elsewhere link there instead of repeating it.

## Storing the data

### DB-01. User-defined data is stored as JSON, in `JSONB` on PostgreSQL

- **Decided:** a project's field definitions (`entry_schema`) and an entry's values (`data`) are JSON
  columns, not one table column per field.
- **Why:** the product lets a person design their own fields. With one column per field, every new
  field would be a database migration. The commit that added the tags, checklist and link types
  records the benefit: "no database migration required".
- **Cost:** the database cannot enforce a value's type, and anything that filters on a custom field has
  to read decoded JSON in Python (see DB-18). Validation therefore lives in the API
  (`_validate_entry_data`), and the tests on it are the safety net.
- **Where:** `app/models.py`, `app/database.py` (`JSONType`), [Database](../architecture/database.md).

### DB-02. One `JSONType` that is `JSONB` on PostgreSQL and plain `JSON` elsewhere

- **Decided:** a custom column type picks the type by dialect.
- **Why:** the tests run on SQLite (see DB-30), which cannot render `JSONB`; the first suite failed
  with "SQLiteTypeCompiler can't render element of type JSONB". `JSONB` is kept in production for
  PostgreSQL's indexing and operators.
- **Where:** `app/database.py`.

### DB-03. Values are stored under a field's **id**, never its name

- **Decided:** `data` is `{field_id: value}`. Names are labels. The same goes for calculation formulas
  and saved statistics (they are written with names, stored with ids).
- **Why:** a rename is only a label change and must not break anything that refers to the field. Stored
  by name, renaming a field would orphan every value, calculation and statistic that used it. This is
  also why the schema builder keeps ids stable across an edit: it is what separates a rename from a
  delete-and-add.
- **Where:** `app/computed.py` (`canonicalize_expression`), `app/custom_statistics.py`,
  `app/schema_migration.py`.

### DB-04. Title and time spent are **columns**, not schema fields

- **Decided:** `title` and `time_spent` are real columns on `entries`. They appear in every form and in
  the schema editor greyed out, but a project's `entry_schema` never contains them.
- **Why:** every entry needs them whatever its project asks for, so they should not depend on a
  project's schema. It also lets the entry list name an entry without depending "on whichever field
  happens to be first" (comment on `Entry.title`). The 2026-10-08 lecturer feedback asked for them to be
  default and visible but not editable.
- **Consequence:** a new field may not take a built-in name ("Title", "Hours spent", "Minutes spent"),
  so a form can never show two fields with one label. A field that already had such a name before the
  rule existed keeps it (see DB-14).
- **Where:** `app/models.py`, `frontend/src/formFields.js`.

### DB-05. The built-in time fields are labelled **"Hours spent" / "Minutes spent"**

- **Decided:** not "Hours" and "Minutes".
- **Why:** a plain "Hours" collided with users' own custom fields called "Hours". When the built-ins
  were first labelled "Hours", 24 tests that look fields up by label found two matches.
- **Where:** `frontend/src/formFields.js`.

### DB-06. `todo` and `due_date` / `due_time` are columns outside `data`

- **Decided:** whether an entry is outstanding, and when it is due, sit in their own columns.
- **Why:** the commit that added them says it directly: "so the outstanding view can query them for
  any project", without knowing that project's fields. Statuses (DB-21) later made `todo` a derived
  value, kept so that everything that already read `todo` (Outstanding, reminders, search) kept working.
- **Where:** `app/models.py`, `app/statuses.py`.

### DB-07. A due date and a due time are two columns, and a date-only string is read as **local midnight** in the browser

- **Decided:** `due_date` is a `DATE`; `due_time` is an optional `TIME`. On the frontend a date-only
  value is parsed as local midnight, not UTC.
- **Why:** parsed as UTC, a due date appears to slip a day for people behind the meridian (comment in
  `OutstandingPage.jsx`). Whether a time is optional is a product choice: most to-dos are "by Friday".
- **Where:** `frontend/src/OutstandingPage.jsx`.

### DB-08. Time zones: UTC on the server, the person's own day where it matters

- **Decided:** timestamps are stored in UTC. Where "today" matters (reminders, recurrence, streaks,
  Mira's date) the client sends its own date, and the server accepts it only within one day of its own.
- **Why:** the server runs on UTC while users in South Africa are two hours ahead, so from midnight to
  02:00 the server still thinks it is yesterday and "due today" would be wrong. A one-day window is
  enough for any real time zone but not enough to fast-forward a recurrence by claiming it is next month.
- **Cost / known limit:** the statistics endpoints bucket by the database's date, not the person's;
  this is noted in the API docs rather than fixed.
- **Where:** `app/automation.py` (`_effective_today`), `app/routers/streaks.py`,
  `app/routers/statistics.py`.

### DB-09. SQLite for tests and local runs, PostgreSQL in production

- **Decided:** the suite runs on a throwaway SQLite file; the deployed app uses Azure Database for
  PostgreSQL through `asyncpg`.
- **Why:** CI needs no database service and a developer can run the tests on a fresh clone. See
  [Testing](../development/testing.md#the-testing-tools-and-why-each-one).
- **Cost:** the PostgreSQL-only paths are not executed by the suite (see
  [what we do not test](not-tested.md#n-04)).
- **Where:** `backend/tests/conftest.py`.

## How a schema change treats existing entries

### DB-10. A schema save changes the **project only**; an entry keeps its own shape

- **Decided:** every entry stores the exact schema it was written under (`schema_snapshot`, plus
  `schema_version`). Saving a new project schema never touches an existing entry. Only when someone
  edits one entry and chooses to (`migrate_to_current_schema`) is that entry brought up to date.
- **Why:** this reverses an earlier decision, after seeing it in use. Eager migration backfilled every
  entry the moment a schema was saved, so adding a field made old entries show a blank value they never
  recorded. The commit also notes it removed a real inconsistency: `data` and `schema_snapshot` could
  previously drift apart mid-transaction; with neither touched by default, they cannot.
- **Cost:** the app has to render each entry against its own snapshot (the entry list, the board,
  search and statistics all do), and it needs a per-entry "bring up to date" choice and preview.
- **Where:** `app/schema_migration.py` (module docstring), `app/routers/projects.py`,
  [Schema](../api/schema.md).

### DB-11. Removed fields are **retired**, not deleted

- **Decided:** a value that cannot survive an edit moves to `Entry.retired_data`, and its field
  definition to `Project.retired_schema`.
- **Why:** "a value without its label is not a record of anything" (comment on `retired_schema`). A
  logbook's purpose is to keep a record, so removing a field hides it from new entries without erasing
  what was said under it. A field removed and then re-added under the same id finds its value waiting.
- **Where:** `app/models.py`, `app/schema_migration.py`.

### DB-12. When an entry is brought up to date, a new date field defaults to the day it was **captured**

- **Decided:** not today, and not blank.
- **Why:** today's date would be wrong on every historical entry; the entry's own date is "the only
  honest guess available" and keeps the column readable. The other defaults are blank text, zero, and
  the first choice of a dropdown.
- **Where:** `app/schema_migration.py`.

### DB-13. A schema edit is previewed by running the **real migration** and discarding the result

- **Decided:** the preview endpoint calls the same function as the save.
- **Why:** so the report a person approves cannot disagree with what is saved. The UI asks twice only
  for this action, because it is the one action that can change data the person did not just type.
- **Where:** `POST /projects/{id}/schema/preview`, `frontend/src/App.jsx` (the review panel).

### DB-14. Limits apply to what is **typed from now on**; stored values over a limit are left alone

- **Decided:** text length (255 / 5,000), the time ceiling, date format, and built-in field names are
  enforced on new input. A value that is unchanged from what is already stored is not rejected.
- **Why:** an entry written when there was no limit would otherwise be impossible to save again, which
  would make editing an old entry fail on something it never did. The same reasoning is behind
  `baseline` in the entry drawer, which remembers what an entry held when editing began.
- **Where:** `app/routers/projects.py` (`previous` argument), `frontend/src/timeSpent.js`,
  `frontend/src/formFields.js`.

### DB-15. Schema field ids and names must be unique; names ignore case and spaces

- **Decided:** names are compared case-insensitively and trimmed. A name may not contain `{` or `}`.
- **Why:** a calculation refers to a field by name, so two names that read the same would be ambiguous,
  and a brace in a name would be read as half a reference.
- **Where:** `app/schemas.py` (`_validate_schema_integrity`).

## Field types and their limits

### DB-16. Short text is 255 characters, long text is 5,000

- **Decided:** `text` is "Short text" (255) and `long_text` (5,000) is new.
- **Why:** the lecturer asked for two sizes with different limits and a box sized to the answer, and an
  upper bound keeps a single JSON value from growing without limit. *The reason these exact numbers were
  chosen is not recorded.*
- **Where:** `app/schemas.py`, `frontend/src/fieldTypes.js` (`TEXT_LIMITS`; the two must agree).

### DB-17. Tags, checklists and links have small, strict limits

- **Decided:** 1 to 10 tags of at most 30 characters, no blanks, no duplicates; checklists up to 20
  items of at most 30 characters, unique ignoring case; a link must name an entry in the **same
  project**, and never the entry itself.
- **Why:**
  - tags exist so entries can be categorised and filtered, and an empty list does neither;
  - two identically named checklist steps are one step written twice, and refusing it is clearer than
    keeping both;
  - a link that leaves its project would be invisible from both sides, and a self-link can never be
    followed or cleaned up.
- **Where:** `app/routers/projects.py` (`_validate_entry_data`).

### DB-18. A deleted entry's links are **cleared** in other entries

- **Decided:** deleting an entry sets any link field that pointed at it to empty.
- **Why:** so no broken reference is left behind. Links are bidirectional (a "Linked from" line), so
  both sides have to stay consistent. A link value is compared as a parsed UUID, not a string, because
  one id can be written with different spellings.
- **Cost:** deleting a *project* deliberately does **not** clear other projects' project references:
  they then read "a project you no longer have", which is true, whereas clearing them would read as
  never having pointed anywhere.
- **Where:** `app/routers/projects.py`.

### DB-19. A project reference is a **schema-level** link, validated against the caller's own projects, and may be left blank

- **Decided:** which project a reference points at is chosen in the schema, once, not per entry. The
  value is checked against a set scoped by user, so it can never resolve to a project that does not
  exist or belongs to someone else. It is the one field type that may be blank.
- **Why:** choosing a target per entry asked the owner to re-answer a question the schema had already
  answered. Being optional is what makes it safe to add to a schema that already has entries.
- **Where:** `app/routers/projects.py`, `app/schemas.py`.

### DB-20. Calculated fields: arithmetic only, stored on write, never `eval`

- **Decided:** a computed field's expression is parsed with `ast` and walked against an allow-list that
  admits numbers, field references, `+ - * /` and parentheses. The result is **stored** in `data` on
  every write. Exponentiation is excluded. Cycles are refused when the schema is saved.
- **Why:**
  - *No `eval`:* the expression is user input.
  - *No `**`:* `2 ** 999999999` is a denial of service in three characters, and no logbook needs it.
  - *Stored, not computed on read:* every reader (timeline, search, CSV export, statistics) already
    reads `Entry.data`, so a stored value is visible to all of them without each learning what a
    computed field is.
  - *Server overwrites whatever the client sent:* offline sync replays captured payloads, and the field
    is read-only in the form, so the server derives it rather than trusting it.
  - *Checked when the schema is saved:* a broken expression should be caught by the one person who can
    fix it, not by whoever next logs an entry.
  - *Division by zero leaves the value unknown* rather than failing the whole write, since an average
    over a day with no hours is a legitimate state. Figures are rounded to six decimals so `0.1 + 0.2`
    does not display as `0.30000000000000004`.
  - *A computed field may read another,* which is worth having (a rate, then a total, then a running
    average), at the cost of a topological sort whose failure is exactly how a cycle is detected.
- **Where:** `app/computed.py`, [Schema](../api/schema.md#computed-fields).

### DB-21. The calculation grammar is evaluated **twice**: on the server and in the browser

- **Decided:** `fieldTypes.js` contains a second parser and evaluator for the same grammar.
- **Why:** the point of a calculated field is watching it settle as you fill the entry in, which cannot
  wait for a round trip. The server stays the authority, so a disagreement is a display bug, never bad
  data. The browser version also avoids `eval` and `new Function`.
- **Cost:** two implementations to keep in step; ten passes are enough for any real schema and cannot
  loop on a circular reference.
- **Where:** `frontend/src/fieldTypes.js`.

### DB-22. Statuses decide whether an entry is outstanding; `todo` follows from the status

- **Decided:** each project has an ordered list of 2 to 8 statuses, each marked done or not done. The
  default pair is "Still to do" and "Done". At least one of each kind is required. Deleting a status
  moves its entries to the **first remaining status that agrees on done-ness**.
- **Why:** so outstanding work stays outstanding and finished work stays finished when a status is
  removed or re-defined. The default pair is what every project had before customisation, so nothing
  changed for a project that never customised them. The cap of 8 and the minimum of 2 are limits chosen
  so a board stays readable; no other reason is recorded.
- **Where:** `app/statuses.py`, `app/schemas.py`, `app/routers/projects.py`.

### DB-23. A finished entry needs its required fields; planned work needs none

- **Decided:** `required` is a per-field flag, default `true`. An entry that is still to do may leave any
  field empty; finishing it (including from the Board or Outstanding) then demands the required fields,
  and the error names the missing ones.
- **Why:** planned work has not happened yet, so it cannot have its details. Making `true` the default
  keeps every field saved before the flag existed behaving as before (they were all required). Only
  `required: false` is sent from the browser, so saved payloads and old tests did not change.
- **Edge rules:** the browser's check skips link, checklist, tags, computed and reference fields (they
  have their own rules) and any field that was already blank when the entry was last saved.
- **Where:** `app/routers/projects.py`, `frontend/src/formFields.js` (`missingRequired`).

### DB-24. Time spent: a ceiling of 10,000 hours for new figures, and `null` means "clear", omitted means "leave"

- **Decided:** a new figure above 10,000 hours is refused; an entry already above keeps its value. An
  explicit `time_spent: null` clears a duration; leaving the key out leaves it alone. Due dates and
  times follow the same rule.
- **Why:** the ceiling stops a typo (an extra zero) turning a total into nonsense; a number that was
  already stored is not held against the entry. Distinguishing null from omitted lets a partial update
  do the least surprising thing.
- **Where:** `app/schemas.py` (`MAX_TIME_SPENT_MINUTES`), `app/routers/projects.py`.

### DB-25. Numbers must be finite; dates must be real days written `YYYY-MM-DD`

- **Decided:** `NaN` and infinity are refused; a date field must be a real calendar day. A value already
  stored in some other form is left alone (DB-14).
- **Why:** added in the phase 2 hardening so a bad value could not be stored and later break a chart,
  a sort or a formula.
- **Where:** `app/routers/projects.py`.

### DB-26. Project names are trimmed and a blank one is refused

- **Decided:** both on create and update, in the schema layer.
- **Why:** a name made of spaces is not a name, and it would be an unclickable blank row in the sidebar.
- **Where:** `app/schemas.py` (`_clean_project_name`).

## Entries and history

### DB-27. An entry's history is **immutable**; reverting adds a version, and deleting is a tombstone

- **Decided:** every create and edit appends an `entry_revisions` row recording what changed and what
  the values used to be. Reverting never removes anything: it adds a new version whose values match the
  chosen one. Deleting only stamps `deleted_at`; the last version keeps what the entry said, and
  reverting to an earlier one restores it. Every ORM `SELECT` hides stamped rows automatically.
- **Why:** a logbook's value is "a record of what they do". The project brief says it "needs to give them
  a record of what they do" above everything else. A correction must never destroy the original.
- **Details worth recording:**
  - Entries saved before history existed get their current state as version 1 before their first
    correction, so the only copy of what they said cannot be overwritten (`_BACKFILL_ENTRY_HISTORY`).
  - A save that changes nothing adds no version unless the person explains it with a note.
  - The hiding of deleted rows is a session event listener, so no query can forget to filter them.
- **Where:** `app/models.py` (`EntryRevision`, `_hide_deleted_entries`), `app/routers/projects.py`.

### DB-28. Entry creation is **idempotent** when the client supplies an id

- **Decided:** `EntryCreate` accepts an optional `id` and `created_at`. A known id returns the existing
  entry with `200` instead of creating a duplicate with `201`.
- **Why:** offline sync and import both replay requests that may already have landed (a response can be
  lost even when the write succeeded). `created_at` preserves the real capture time. Naive timestamps are
  read as UTC; future-dated ones are refused, because a future-dated entry would sit at the top of the
  timeline for ever and the person cannot correct it.
- **Detail:** an id that belongs to another user's project returns `409` and never discloses the entry.
  The idempotency lookup is deliberately **before** the "project is archived" check, so an entry that
  synced just before archiving is returned, not rejected.
- **Where:** `app/routers/projects.py`, `app/schemas.py`.

### DB-29. Rules never trigger each other; the older rule wins

- **Decided:** entry rules run when an entry is created. Each rule's conditions are checked against what
  the author actually typed (plus computed fields), not against what earlier rules produced.
- **Why:** so the result does not depend on which rule runs first, and rules cannot loop. When two rules
  fill the same blank field, the older rule wins. A rule that points at a field since removed is skipped,
  not failed: "the person saving an entry should never be blocked by a rule they may not even know
  exists". A due date the author chose beats one a rule suggests.
- **Limits:** 20 rules per project, 5 actions per rule, 10 conditions, due within 365 days. *The reason for
  these particular numbers is not recorded;* saved filters carry a matching cap of 10 conditions, which the
  code says is so a filter "cannot be used to build an arbitrarily expensive query".
- **Where:** `app/automation.py`, `app/schemas.py`.

### DB-30. Recurring entries are created on the **next request that asks "what is due?"**

- **Decided:** there is no scheduler. `GET /reminders` creates any occurrence that has come due.
- **Why:** Azure App Service has no scheduler to wake the app at midnight. A unique
  `(recurrence, date)` constraint means any number of requests, in any number of worker processes, can
  run the check at once without a duplicate. Each occurrence is created in a savepoint, and the
  recurrence's own progress is written outside it, so rolling one occurrence back never undoes the
  bookkeeping of the ones already made.
- **Rules:** dates are always counted from the anchor, never from the previous occurrence, so a monthly
  entry on the 31st returns to the 31st after a short month. Missed occurrences are created (up to 31 per
  recurrence per call) rather than skipped, so a gap in a daily log shows as outstanding entries instead
  of vanishing. A new occurrence copies the source's title and values with checklists unticked.
- **Where:** `app/automation.py`, `app/routers/automation.py`.

### DB-31. Reminders list to-do entries and open tasks **together**

- **Decided:** one list, overdue first (most overdue at the top), then by date.
- **Why:** "to the person being reminded they are the same thing: something they said they would do".
- **Where:** `app/automation.py` (`reminders`).

## Search, statistics and the rest of the read side

### DB-32. Keyword, tag and condition filters run **before** pagination, in Python

- **Decided:** when any of those filters is active, the server loads the matching set, filters it, then
  pages it. With none active, the database pages the ordered result.
- **Why:** those filters can only be matched against decoded JSON in Python. Paging first dropped matches
  that fell outside the first page; this was a real bug (commit `d9ce101`), now covered by regression
  tests. The no-filter case stays in SQL so a history of thousands of entries is not materialised for
  every timeline request.
- **Where:** `app/routers/entries.py`.

### DB-33. Structured search reads each entry against **its own snapshot**; empty conditions match everything; ranking is lexicographic

- **Decided:**
  - operators are validated against the project's current schema, but an entry's value is read against
    that entry's own `schema_snapshot`; an entry that predates a field is "not recorded", never an error;
  - an empty condition list is not a filter (Python's `any(())` is `False` and would silently exclude
    everything);
  - relevance sorts first by how many OR-conditions matched, then by keyword hits, "lexicographic rather
    than a blended score", because a sum could rank an entry that merely repeats a keyword above one that
    satisfies more conditions;
  - conditions travel as a JSON query parameter because a `GET` has no body.
- **Where:** `app/search.py`.

### DB-34. Undated outstanding work sorts last

- **Decided:** a deadline that exists is more urgent than one that was never set, whatever its date.
- **Where:** `app/routers/entries.py`.

### DB-35. Statistics: distinct days, "alive" streaks, zero-filled weeks

- **Decided:**
  - *Active days* are distinct days, so the figure is bounded by the calendar, not by how much was
    written; the overall figure is queried separately because summing per-project figures double-counts a
    day worked on two projects.
  - *A streak is alive* if the last active day is today or yesterday ("not having written yet today is not
    the same as having stopped"); one that ended earlier reads 0 with the longest run kept beside it.
  - *Weekly activity includes the quiet weeks,* so a chart has no gaps that could be misread as missing
    data. Weeks start on Monday. Ties for the busiest weekday go to the earlier weekday.
  - *Field statistics and timelines read each entry against its snapshot,* include fields that have been
    retired, and skip a value whose historical type differs from the field being asked about.
  - An empty date range returns an empty series, not "field not found".
- **Where:** `app/routers/statistics.py`.

### DB-36. A saved statistic is a formula in the same grammar, and cannot fail the request

- **Decided:** `sum`, `avg`, `min`, `max`, `count` over number or computed fields, plus `+ - * /`, parsed
  like a computed field. `sum` reads as "Total" because that is what a person says. A formula that cannot
  produce a number yet returns `None` with a sentence saying why, with `entries_used` so a formula that
  quietly ignores the whole logbook is visible.
- **Why:** shared grammar and safety with DB-20. Returning a note instead of an error is because "no
  matching entries" is a normal state of a logbook.
- **Where:** `app/custom_statistics.py`.

### DB-37. The Statistics layout is a preference and fails quietly

- **Decided:** a saved panel arrangement that cannot be read falls back to the default; unknown,
  duplicated or non-boolean panels are refused with plain 400s. The trend panel starts hidden because it
  needs a project and field picked before it can say anything.
- **Where:** `app/routers/statistics.py`, `frontend/src/StatisticsPage.jsx`.

### DB-38. Badges are counted from stored work, and an earned badge stays earned

- **Decided:** each badge is data (name, tier, the measured figure, the target). Figures are counted from
  what is stored, never kept as counters. Earned badges are remembered with a time.
- **Why:** counters can drift out of step with the work behind them; and deleting a project must not take
  back the "First Chapter" someone earned for creating one. An existing account meeting badges for the
  first time gets those it already qualifies for awarded quietly, because celebrating twenty at once
  "would be noise, not a celebration". The platinum trophy is worked out last, from a count of the others.
- **Where:** `app/achievements.py`.

### DB-39. The dashboard is saved as one whole list; each panel type has its own config model

- **Decided:** add, remove and reorder are all "send the full desired list, in the new order" (`PUT`).
  Each panel type has a small config model; a panel's width is 1 to 6 columns and height 1 to 4; the grid
  is 2 to 6 columns wide, 3 by default.
- **Why:** a drag or a delete becomes "compute the new array, PUT it" rather than a set of matching
  endpoints. Separate config models mean a panel that claims to be a board but has no `project_id` fails
  validation instead of saving something the frontend cannot render. A panel pointing at an id the person
  cannot access simply fails to resolve on read, because the endpoints that serve its data already enforce
  ownership.
- **Where:** `app/schemas.py`, `app/routers/dashboard.py`.

### DB-40. Saved filters: re-using a name overwrites

- **Decided:** saving a filter under an existing name updates it. Criteria are JSON capped at 10
  conditions, and a filter pinned to a project the caller does not own is refused.
- **Why:** from the person's side, "save this as My Bugs" a second time is an update; rejecting it would
  leave them deleting the old one first. JSON means a new filter control needs no schema change. The
  ownership check stops a saved filter being used to probe for other people's project ids.
- **Where:** `app/routers/saved_filters.py`, `app/models.py`.

## Sharing and access

### DB-41. Sharing is an **invitation**; only acceptance grants access

- **Decided:** sharing creates a pending membership. Nothing appears in the invitee's workspace and
  nothing is readable until they accept. Declining is **kept**, so the owner sees an answer rather than
  silence; re-inviting moves the same row back to pending. Inviting twice returns the existing invitation.
- **Why:** the first version granted access the instant an owner typed an email, which put a stranger's
  project in your sidebar unasked, with no way to give it back. Declined rows are kept because "no" is an
  answer. Existing members from before invitations are migrated as **accepted**, because turning them into
  unanswered invitations would "take collaborators' projects away from them overnight".
- **Where:** `app/models.py` (`ProjectMember`), `app/routers/invitations.py`, migration `008`.

### DB-42. Owners reshape; members add, and edit only what they wrote

- **Decided:** an accepted member can read a project, add entries and tasks, and tick tasks off. Only the
  owner edits the schema, archives, deletes, exports, or changes who has access. A member can edit or
  delete only entries they personally wrote.
- **Why:** "being invited to contribute cannot become control of someone else's record". A contributor who
  cannot fix their own typo has to ask the owner, but one who can rewrite everyone else's entries is no
  longer a contributor to somebody's record. Confirmed with the project owner when it was built.
- **Where:** `app/routers/projects.py` (`_get_writable_entry`), `app/routers/tasks.py`.

### DB-43. Not found, not forbidden, for other people's things

- **Decided:** projects, filters and statistics are looked up scoped by user, and a miss is `404`.
- **Why:** a project belonging to someone else must be indistinguishable from one that does not exist,
  otherwise the response confirms which ids are real. Anonymous access to the tasks endpoints was an
  actual defect (found and fixed on 2026-09-11) because the router declared no authentication dependency.
- **Where:** `app/routers/tasks.py`, `app/routers/saved_filters.py`, `app/routers/statistics.py`.

### DB-44. Authorship foreign keys are `SET NULL`; owner data cascades

- **Decided:** `created_by`, `completed_by` and an invitation's inviter are cleared when an account is
  deleted, not cascaded. A project's own children cascade.
- **Why:** "the record outlives the contributor, which is the whole point of a logbook". Authorship columns
  are nullable also because work from before sharing has no author, so "unknown" has to render as
  gracefully as a name.
- **Where:** `app/models.py`.

### DB-45. Deleting a project deletes its children **explicitly**

- **Decided:** the delete handler removes tasks, recurrences, entries, notes, schema-change records and so on in code, and the UI asks
  the owner to type the project's name.
- **Why:** `tasks.project_id` carries no cascade, so PostgreSQL would refuse to delete a project that
  still had tasks; and SQLite does not enforce foreign keys unless asked to, so the tests would not have
  caught it. Archiving is the ordinary way to finish a project because it keeps the record.
- **Where:** `app/routers/projects.py`.

### DB-46. Completing a task records who, and reopening clears it

- **Decided:** `completed_by` always describes the completion that currently stands.
- **Why:** not "whoever happened to tick it once before".
- **Where:** `app/routers/tasks.py`.

## Export, import and migrations

### DB-47. The JSON export round-trips; the CSV is deliberately lossy

- **Decided:** `GET /export` is the whole logbook (archived projects too). The per-project CSV drops the
  schema.
- **Why:** an export that quietly omitted archived projects "would not be a record of your work". A CSV has
  no way to carry a schema and each project defines its own fields, so there is no single set of columns
  across a logbook. A file is marked `chronicles-export` so importing an unrelated JSON document fails with
  a clear message rather than a confusing validation error.
- **Where:** `app/routers/transfer.py`.

### DB-48. Import is additive and reconciles by id (three outcomes)

- **Decided:** a project you already own is **reused** with its current name and schema left alone; a free
  id is restored exactly; an id held by someone else is created under a fresh id with entries remapped.
  Nothing is deleted or overwritten. Entries that no longer fit are reported with their date, project and
  reason.
- **Why:** restoring an old backup must not revert a schema you have since improved ("the entries are what
  the user came for"). Re-importing your own export is a no-op because everything is found by id.
- **Known limit:** re-importing someone else's export creates copies each time, because nothing records
  which exported id a copy came from. Fixing that needs provenance stored on the rows.
- **Where:** `app/routers/transfer.py`.

### DB-49. The CSV importer reads rows into the **same document** the JSON import takes

- **Decided:** the browser turns a CSV into an export document and shows a preview; the server's import
  does the restoring.
- **Why:** one set of rules, and nothing is imported until the person confirms. A project you already own is
  added to using its existing fields and never reshaped. A leading `= + - @` in a cell is quoted on export
  so a spreadsheet does not run it as a formula, and a byte-order mark is written so Excel reads accents.
- **Where:** `frontend/src/csvImport.js`, `frontend/src/exportFormats.js`.

### DB-50. The PDF export is a small hand-written writer

- **Decided:** Helvetica text on A4 pages, wrapped by an estimate of glyph width; characters outside
  Latin-1 become `?`. The other five formats keep them exactly.
- **Why:** it is dependency-free, so no PDF library is added to the bundle. The price (the `?` for other
  scripts) is stated in the code and chosen over adding a dependency. Whether a library was evaluated is
  not recorded.
- **Where:** `frontend/src/exportFormats.js`.

### DB-51. Schema changes reach production through a startup patch, not Alembic

- **Decided:** `create_all` builds missing tables; `_ADDED_COLUMNS` adds missing columns with
  `ADD COLUMN IF NOT EXISTS` on PostgreSQL; a similar patch brings an old local SQLite file up to date.
  The SQL files in `migrations/` are kept as the record of each change.
- **Why:** `create_all` never adds a column to an existing table, and the deploy workflow never runs
  `migrations/`, so the patch is the only thing that reaches an existing production database. When it
  listed two columns while nine had been added, queries returned 500 in production while working locally;
  a test now fails if a migration adds a column the list does not carry. The comment in `main.py` says it
  is "not a substitute for Alembic": it only ever adds.
- **Why not Alembic:** a stated intention to adopt a migration tool "when the schema starts changing
  between sprints"; it was not done. No later reason is recorded.
- **Where:** `backend/main.py`, `backend/migrations/`, [Deployment](../development/deployment.md).

### DB-52. A Postgres advisory lock stops two workers racing on start-up

- **Decided:** `startup.txt` runs two uvicorn workers; each takes a transaction-scoped lock before
  `create_all`.
- **Why:** with several workers, two could create the same table at once on a fresh database.
- **Where:** `backend/main.py`, `backend/startup.txt`.

### DB-53. The connection pool is 10 + 5 per worker, with pre-ping and 30-minute recycle

- **Decided:** `pool_size=10`, `max_overflow=5`, `pool_pre_ping`, `pool_recycle=1800`.
- **Why:** SQLAlchemy's defaults (5 + 10) made requests queue once about 15 were in flight, and overflow
  connections are closed as soon as they are returned, so sustained load kept opening fresh TLS
  connections to Azure Postgres. Pre-ping drops connections Azure closed while idle. The total across
  workers has to stay under the database's connection limit. Measured in the
  [API performance](../testing/api-performance.md) work.
- **Where:** `app/database.py`.

## Sign-in, sessions and external services

### DB-54. Google sign-in only; no passwords in Chronicles

- **Decided:** authentication is Google OpenID Connect through Authlib. An email-and-password flow was
  built (2026-08-19 to 08-20, with a password reset and Resend email) and removed on 2026-08-24.
- **Why:** the project brief requires "established practices and libraries" rather than a hand-rolled
  system, and Google manages passwords and recovery, so Chronicles "never receives or stores a Google
  password". *The removal commit gives no reason of its own; the reasoning above is the one the
  authentication document states.* Sign-up, sign-in, deletion and recovery are covered as described in
  [Authentication and Azure](../architecture/authentication-and-azure.md).
- **Consequence:** Resend is now used only for the account-deletion confirmation, best-effort, and a
  failure does not block deletion.
- **Where:** `app/routers/auth.py`, `app/email.py`.

### DB-64. The OAuth callback retries once, and refuses an email that another identity owns

- **Decided:** the token exchange with Google is attempted twice, 0.25 s apart, on a network error; and when a
  verified email already belongs to an account with a *different* Google subject id, sign-in is refused with
  "Use its existing sign-in method".
- **Why:** a single dropped packet should not be a failed sign-in; and matching accounts by email alone would let
  a second identity take over an account. Users are keyed on Google's stable subject id, not their email. *The
  retry count and delay are not otherwise explained in the code.* Name, email and photo are refreshed from Google
  on each sign-in.
- **Where:** `app/routers/auth.py` (`google_callback`).

### DB-65. Who changed a schema is recorded in its own table, from now on

- **Decided:** every schema save that really changes the schema adds a `project_schema_changes` row: who, when,
  the version it moved from and to, and a summary of what changed (kind and field name). Nothing is backfilled.
- **Why:** a schema save changes only the project and never an entry (DB-10), so a team view had nowhere to find out
  who made one: the project keeps only a version number. Entries and tasks already carry their authors, and every
  entry version records who made it, so they needed nothing new; the schema was the one gap. A save that re-sends
  the schema it already has (the project form does so to rename a project) changes nothing and is **not** recorded.
- **Why not backfill:** the information does not exist. The honest options were to guess an author or to start
  counting now, and the response says from when (`schema_changes_recorded_since`) so a count is never read as
  "ever". `changed_by` is cleared rather than cascaded when an account is deleted, so the change survives its
  author (DB-44); it then appears under "Author not recorded".
- **Where:** `app/models.py` (`ProjectSchemaChange`), `app/routers/projects.py` (`_replace_schema`),
  migration `023`. The start-up patch needs no entry because it is a new table, which `create_all` builds.

### DB-66. Team statistics are counted from stored work, on request

- **Decided:** `GET /projects/{id}/team` counts entries logged, entries completed, entries edited, time logged,
  tasks added, tasks completed and schema changes per person from the rows that already exist. There are no
  counters and no cache.
- **Why:** the same reasoning as badges (DB-38): a counter can drift from the work behind it, a count cannot. It costs a handful of grouped queries and one pass over the project's entry versions, which is acceptable at the size
  of one project; it would be revisited if a single project grew to many thousands of versions.
- **How each is defined**, since a number is only as good as its definition:
  - *Completed* means the person saved a version in which `todo` went from true to false. An entry logged as
    finished is not "completed" by anyone, and whoever finishes planned work is credited even if someone else
    wrote it.
  - *Edited* counts versions with the action `edited` or `reverted`, credited to whoever saved the version, so an
    owner's correction of a member's entry is the owner's edit while the entry stays logged by the member.
  - *Tasks completed* counts tasks that are currently complete, credited to `completed_by`; reopening one removes
    it, because the completion no longer stands (DB-46).
  - Soft-deleted entries are excluded by the session filter (DB-27).
- **Who appears:** the owner; every member with their invitation state (pending and declined are shown but do not
  count as working); **former** members who did something and then left or were removed, because a record keeps
  its authors; and one **"Author not recorded"** row for work with no author (written before sharing existed, or
  by a deleted account), shown only when there is something in it.
- **Who may read it:** the owner and accepted members, the same rule as the project (`_get_readable_project`). The
  figures describe people's work on a shared record, which a member already sees, and a pending invitee sees
  nothing, as with everything else. *Whether members should see each other's statistics at all was decided here,
  not asked of a user; it is easy to restrict to the owner.*
- **Where:** `app/routers/projects.py` (`read_project_team`), `app/schemas.py` (`ProjectTeamResponse`),
  `backend/tests/test_project_team.py` (17 tests).

### DB-67. The activity feed is derived from stored work, not a log of its own

- **Decided:** `GET /projects/{id}/activity` builds its lines from entry versions, tasks, the schema-change record and
  the time invitations were answered, merges them by time and returns the newest `limit`. There is no separate
  events table.
- **Why:** entry versions already record who did what and when (DB-27), so a second log would only restate them and
  could drift from them (the same reasoning as DB-38 and DB-66). Each source is cut to `limit` before the merge, so
  the cost does not grow with the project's history. Deletions are shown, by asking the query for deleted entries
  (`include_deleted`), because a feed that hid deletions would hide the most important thing it could say.
- **Limits, stated rather than hidden:** a task has no completion timestamp, so "completed" is when its row last
  changed (a later edit moves it); schema changes begin on the day they were first recorded (DB-65); edits are
  credited to whoever saved the version (DB-66).
- **Where:** `app/routers/projects.py` (`read_project_activity`), `app/schemas.py` (`ActivityItem`),
  `backend/tests/test_project_activity.py`.

### DB-68. The owner is told an invitation was answered, for 14 days or until dismissed

- **Decided:** `GET /invitations/answers` lists answered invitations for the caller's projects whose notice has not
  been dismissed and which were answered in the last 14 days; `POST /invitations/answers/seen` dismisses them by
  stamping a new nullable `project_members.owner_seen_at`.
- **Why:** the sharing page listed "no notification" as a known limitation; an owner only found out by opening the
  members list. A column on the membership is the smallest thing that can remember a dismissal. The 14-day window is
  because every answer given since invitations were introduced has `owner_seen_at` empty, and without a limit they
  would all arrive at once the day this shipped. *Why exactly 14 days is not otherwise recorded.* Rows from before
  answers were timestamped have no `responded_at` and give no notice.
- **Why not email:** an email path is hard to test and needs a template and a failure policy; the in-app notice
  covers "tell me when it happens" and the bell is already where invitations arrive (UI-66).
- **Where:** `app/routers/invitations.py`, `app/models.py` (`owner_seen_at`), migration `024`, start-up patch.

### DB-70. Project notes are private or shared, one switch per note

- **Decided:** a note on a project has a `visibility` of `private` (the default) or `shared`. A private note is read
  only by its author, including **not** by the project's owner. A shared note is read by everyone on the project and
  carries its author. Only the author edits a note; the author, or the owner for a *shared* note, deletes it.
- **Why a switch per note, not one choice for the whole feature:** the request was for notes someone can "save and
  see anytime", and the open question was whether the team should see them. Both needs are real. A scratch reminder
  to oneself should not be readable by the team, and a decision the team reached should not be locked in one person's
  head. A per-note switch gives both, defaults to the safe one (private), and can be changed later, so a mistaken
  choice is not permanent.
- **Why the owner cannot read a private note:** "private" has to mean private, or people would write less honestly
  and the label would be a promise the app does not keep. The owner already controls the project's structure and
  membership (DB-42); reading personal notes is a different power and is not needed to run a project.
- **Why the owner can delete a shared note:** it sits on the team's page, so the person responsible for the page
  needs a way to remove something that should not be there. Deleting a private note is not offered because the owner
  cannot see it.
- **Why filtered in the query, and `404` not `403`:** the list is "shared, or private and mine", so another person's
  private note is never loaded. Asking for one by id reads exactly like a note that does not exist, which stops the id
  being used to learn that a private note is there. A shared note you cannot edit is `403`, because its existence is
  already known to you.
- **Why not a history, search or statistics for notes:** a note is free writing, not a record. Entries are the
  record (DB-27) and are what the statistics count; counting notes there would blur the two. *Whether notes
  should be searchable is not decided.*
- **Why the author is cleared (SET NULL) and not cascaded:** a shared note is the team's, so it should outlive one
  member's account, the same reasoning as DB-44. It shows as "Former member". A private note whose author is gone is
  then readable by nobody, which is the honest result of "only the author".
- **Why deleted explicitly with the project:** SQLite in the tests does not enforce cascades (DB-45), and a test
  caught that notes were left behind when a project was deleted; `delete_project` now removes them (and the
  schema-change records, which had the same gap) in code.
- **Where:** `app/models.py` (`ProjectNote`), `app/routers/notes.py`, `app/schemas.py` (`Note*`), migration `025`,
  `tests/test_project_notes.py`, [Project notes](../api/notes.md).

### DB-69. A small set of read-only reference endpoints is public

- **Decided:** `GET /public/info`, `/public/field-types` and `/public/limits` (and the existing `/health`) need no
  sign-in. They describe the API, the ten field types with what each stores and how it can be searched, and the limits
  the API enforces.
- **Why:** the brief's "API" criterion asks whether the API is available for external usage, and someone building
  against Chronicles needs to know what it accepts before they have an account. This is the part that is safe to open:
  every response is identical for every caller, contains nobody's data, touches no database and reads no session, so it
  cannot leak anything, costs almost nothing to serve, and needs no rate limit beyond the platform's. It is cacheable
  for an hour because it only changes when the code does.
- **How it stays true:** the limits are imported from the same constants the validation uses (not copied), and a test
  fails if a field type is added without being described. A test also confirms the advertised project-name limit is
  the real one.
- **What was considered and left out:**
  - *Usage counts (users, projects, entries):* they reveal how much Chronicles is used and serve no one building
    against it.
  - *A public read-only view of a project:* making a person's record world-readable is a decision for its owner, so it
    would need an explicit "publish" switch, an unguessable link and a way to revoke it. That is a feature with its own
    privacy design, not a side effect of an API question.
  - *Making existing endpoints anonymous:* every other endpoint is scoped to a person, so there is nothing about them
    that could be public.
- **Where:** `app/routers/public.py`, `backend/tests/test_public_reference.py`, [Public reference](../api/public.md).

### DB-55. OAuth `state` is a signed token, not a session cookie

- **Decided:** the state is a JWT-signed nonce (`{uuid}.{jwt}`), not Authlib's session-based state.
- **Why:** the session-based version relies on cookies surviving the whole redirect chain, which was
  "fragile when teammates access the app from different domains or via Azure deployment URLs" (it caused
  CSRF errors for teammates, fixed 2026-08-25).
- **Where:** `app/routers/auth.py`.

### DB-56. Two tokens: a short-lived bearer token, and a 30-day cookie that renews it

- **Decided:** an access token (HS256, 60 minutes by default) lives in `localStorage`; a 30-day HTTP-only
  session cookie (`chronicles_refresh`, path `/auth`, `SameSite=Lax`, `Secure` in production) renews it.
  Cookie-authenticated mutations must come from our own frontend origin. Sign-out is never silently undone
  by the cookie after an offline sign-out.
- **Why:** the cookie means closing and reopening a tab keeps you signed in (a rubric question), while a
  short bearer token limits how long a leaked one is useful. The session row is stored by hash.
- **Where:** `app/routers/auth.py`, `app/security.py`, `frontend/src/api.js`.

### DB-57. `POST /auth/dev-login` exists only when `ENABLE_DEV_LOGIN=true`, and then answers `404` otherwise

- **Decided:** a local-only sign-in that mints a real session for any email. Off everywhere by default,
  never set in Azure, and the sign-in page only offers it when `VITE_ENABLE_DEV_LOGIN` is set (the check
  compiles away in a production build). The test suite sets it explicitly to `false`.
- **Why:** the team's shared Google OAuth client only has `localhost` registered for whoever administers it,
  so Google sign-in is a dead end on everyone else's machine. It answers `404`, not `503`, so its existence
  is not even revealed where it is off. It finds-or-creates by email through the same path as Google so
  local data carries over between runs.
- **Where:** `app/routers/auth.py`, `app/config.py`, `backend/tests/conftest.py`.

### DB-58. Google Calendar is read-only, and activities are private and local

- **Decided:** the Calendar scope is `calendar.readonly`. Activities created in Chronicles are stored in
  Chronicles and never written to Google Calendar. The callback is `/auth/google/calendar/callback`.
- **Why:** Chronicles has no need to change someone's real calendar, and a smaller scope is a smaller
  permission to ask for. The callback path is what Google Cloud Console was configured with (moving it
  fixed a 404). Calendar's synchronous SDK runs off the event loop so it cannot block other API requests.
- **Where:** `app/routers/calendar.py`, `app/routers/activities.py`.

### DB-59. Mira's AI service is isolated in one file; the model is configuration

- **Decided:** all Gemini calls go through `app/services/gemini_service.py`, and the model name is
  `GEMINI_MODEL` (default `gemini-3.5-flash-lite`).
- **Why:** it is "the one file to change to swap AI providers". Thought summaries are requested but the
  answer still streams if a model does not support them. A missing key raises a specific error that is
  shown to the person as the reason, and the failed question is rolled back so a retry does not duplicate
  it (fixed 2026-10-07).
- **Where:** `app/services/gemini_service.py`, `app/config.py`.

### DB-60. A leaked key was removed, and the lesson recorded

- **Decided:** a live Gemini key had been committed in `.env.example` and was replaced by a placeholder on
  2026-09-14.
- **Why / status:** anyone with repository access held a working credential. The commit states the key
  "remains in history and must still be rotated". *Whether it was rotated is not recorded in the
  repository; confirm it was.* Secrets are only ever read from the environment (`app/config.py`).

### DB-61. Request bodies reject unknown fields

- **Decided:** `extra="forbid"` on the request models (not on the user-defined `data` payload).
- **Why:** a typo such as `{"nmae": "x"}` used to succeed as a silent no-op; it now returns 422 naming the
  field. Descriptions are capped at 4,000 characters, matching activities. This closed two robustness
  findings from the load and robustness work.
- **Where:** `app/schemas.py`.

### DB-62. Validation errors are `422`, not `400`

- **Decided:** keep FastAPI's default. Argued in full in
  [API Performance](../testing/api-performance.md#3-validation-status-codes-us-315-decided-keeping-422).

### DB-63. The API is documented by hand and by OpenAPI

- **Decided:** every router has a page in the API reference, and OpenAPI is served by FastAPI.
- **Why:** the brief requires an external, documented, hand-written API. A route-versus-docs audit now
  runs as a script (see [Docs maintenance](../development/contributing.md)); on 2026-10-09 it found seven
  routes lacking a documented method, since added.
