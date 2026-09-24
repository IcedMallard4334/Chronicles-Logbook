# Sprint 3 — Victor's Work Log & AI Declaration

Person 4 (Victor)'s running log for Sprint 3: what changed, why, and which
parts were AI-assisted. Kept incrementally, one section per story, as the
work happens — this is the paper trail for the course's AI Declaration
requirement (tool, model, purpose) for everything in this workstream.

**Tool:** Claude Code · **Model:** Claude Sonnet 5 · **Branch:** `feat/victor-sprint3`

## Assigned stories

Per the Sprint 3 planning document's task table (Person 4) plus items
reassigned directly by the team (marked *informal* below — not in the
written sprint doc):

1. US-3.11 — Structured search over custom fields
2. *(informal)* Schema edits must not corrupt old entries
3. *(informal)* Shared projects: invite / accept / decline / leave
4. *(informal, polish)* Page transition animations
5. US-3.17 — Perceived performance & Lighthouse pass
6. US-3.19 — Accessibility
7. US-3.23 — First-time login onboarding
8. US-3.24 — Theme-aware background

## 0. Branch setup and recovered prior work

Before any Sprint 3 work started, `fix/sprint-2-completion` (the branch
already checked out) had ~6 days of **uncommitted, unreviewed** changes
sitting in the working tree — the leftovers of an earlier session that
never committed. Untracked files included draft implementations already
wired into `App.jsx` for several of this workstream's stories:
`Invitations.jsx` (+ backend router + migration), `ViewTransition.jsx`,
`GuidedTour.jsx` + `tourSteps.js`, `AmbientBackground.jsx`, and an
`EntryEditor.jsx` rework, alongside unrelated Sprint 2 carryover work
(rich fields, statistics) that isn't this workstream's to touch.

Actions taken (confirmed with the project owner before proceeding):

- Scanned the full diff for secrets before touching anything (none found;
  `.env` itself was never modified, only `.env.example`).
- Committed that WIP as-is on `fix/sprint-2-completion` as a single
  clearly-labelled, **unreviewed** recovery snapshot (commit `9192669`,
  `chore(recovery): snapshot unreviewed WIP from a prior session`) purely
  so it lives in git history instead of only on local disk. Not pushed.
  Excluded from the snapshot: three local QA harness pages
  (`public/__flow.html`, `__measure.html`, `__probe.html`) that inject a
  hardcoded fake auth token into `localStorage` for taking UI screenshots
  — useful locally, but not something that should ship in the production
  frontend bundle, so they stay untracked/gitignored rather than built
  into `dist/`.
- Updated local `main` to the last-known `origin/main` (fast-forwarded;
  this sandbox has no network access to the team's Gitea instance, so
  this is as fresh as the most recent local fetch, not a live pull).
- Branched `feat/victor-sprint3` off that updated `main` — **not** off
  the recovery snapshot — so this branch's history stays scoped to
  Victor's own stories rather than inheriting six other people's
  in-progress Sprint 2 carryover work wholesale.
- Where a story below already had a draft in that recovery snapshot, the
  draft was pulled in *per file*, reviewed, fixed and tested like any
  other code — not trusted or merged wholesale.

AI-assisted: the discovery, secrets scan, and recovery/branch strategy
above were done with Claude Code (Sonnet 5) at the project owner's
direction, after presenting the findings and getting an explicit decision
on how to handle the recovered work.

## 1. US-3.11 — Structured search over custom fields

**Before:** `GET /entries` did one flat case-insensitive substring match
across every field value concatenated together, with no way to target a
specific custom field, no AND/OR combination, and no relevance ordering
(only date-based sorts).

**Changed:**

- `backend/app/schemas.py` — new `FieldCondition` model; `FilterCriteria`
  (shared with saved filters, US-2.12) gains `conditions`/`match`, and its
  `sort` literal gains `"relevance"`.
- `backend/app/search.py` (new) — the type-aware operator table, per-type
  matchers, JSON parsing/validation for the `conditions` query param with
  plain-English error messages, and the relevance scoring/ranking.
- `backend/app/routers/entries.py` — wires `conditions`/`match` into
  `search_entries`; extended its own `sort` pattern validator too (it's
  separate from `FilterCriteria`'s).
- `docs/api/entries.md` — documents the new params, the operator table per
  field type, and the relevance heuristic.
- `frontend/src/fieldTypes.js` — `SEARCH_OPERATORS_BY_TYPE`, the single
  source of truth the condition-builder UI reads so it can't drift from
  what the backend actually validates.
- `frontend/src/StructuredSearch.jsx` (new) — the condition-builder UI,
  scoped to whichever project is selected (a field id only means something
  within its own project's schema).
- `frontend/src/WorkspacePages.jsx` (`EntriesPage`) — wires the builder in;
  adds a "Best match" sort option that activates automatically once a
  query/condition is active, unless the person has explicitly chosen a
  different sort themselves.
- `frontend/src/api.js` — `fetchEntriesGlobal` sends `conditions`/`match`.
- Tests: `backend/tests/test_structured_search.py` (24 tests: one/two per
  operator, AND/OR combination, the `any(())` empty-list edge case,
  malformed/invalid input, schema-versioning interaction, relevance
  ordering), `frontend/src/StructuredSearch.test.jsx` (8 tests), and two
  existing exact-match assertions in `SavedFilterBar.test.jsx` updated for
  the criteria shape's new fields.

**Design decisions worth recording:**

- A condition is evaluated against the *entry's own* `schema_snapshot`, not
  the project's current schema — matching how `statistics.py` already reads
  historical field values, so an entry that predates a field (or never had
  it backfilled onto its snapshot) is excluded rather than misread. Covered
  by `test_conditions_do_not_match_a_field_older_than_the_entry`.
- Relevance ranks lexicographically (matched-condition count, then keyword
  occurrence count, then recency) rather than as a blended score, so an
  entry that satisfies more OR'd conditions always outranks one that merely
  repeats a keyword often.
- `conditions` requires `project_id`, since a field id is only meaningful
  within the schema that defines it; the UI enforces the same thing by
  hiding the condition builder until a project is chosen, and clears any
  existing conditions if the project selection changes.

**Caught by independent verification, fixed before commit:** a tester pass
(fresh context, also Sonnet 5) ran the implementation, then mutation-tested
the new test suite itself — deliberately breaking specific behaviors in
`app/search.py` and checking whether the corresponding test actually failed,
before reverting. Two real gaps surfaced: `test_conditions_combine_and`'s
fixture had every entry satisfying either both OR'd conditions or neither,
so flipping AND to OR left it passing; and both relevance-ordering tests
either didn't assert order at all or had their expected order confounded
with the recency tiebreak, so zeroing out the relevance score entirely
still passed them. All three were rewritten with fixtures/assertions that
specifically defeat the recency tiebreak and distinguish AND from OR, then
re-verified with the same mutate-and-confirm-failure method before being
reverted clean.

AI-assisted: implementation, tests and docs written with Claude Code
(Sonnet 5). The plan was checked by an independent reviewer pass (also
Sonnet 5, fresh context) before implementation started, which caught a
real correctness bug (`any(())` on an empty condition list silently
excluding everything), the schema_snapshot-vs-current-schema design
question above, a relevance-scoring quality issue, and two places the
`sort` validator needed extending in lockstep. All four were fixed before
any code was written against the original plan.

## 2. Schema edits should not corrupt old entries

**Investigation (reported to the project owner before any fix was
written):** eager migration (`_replace_schema` in `projects.py`) already
never destroys data — a value that doesn't survive a schema change moves to
`retired_data`, never deleted. But it never refreshed `entry.schema_version`/
`entry.schema_snapshot`, which stayed frozen at creation time. That mattered
because `update_entry` validated an edit against `entry.schema_snapshot or
project.entry_schema` — the *stale* value — while `entry.data` had already
been migrated to the *current* schema by the same eager migration. A test
already on main, `test_update_entry_validates_against_its_schema_snapshot`,
locked in the resulting bug: after a schema change, submitting an edit in
the entry's original (superseded) shape succeeded and reverted that one
entry's data back out of step with the rest of the project, while
submitting the edit in the project's actual current shape was rejected with
422 — the opposite of both common sense and what `docs/api/entries.md`
already documented. A related discovery: `statistics.py` also reads a
field's type from `entry.schema_snapshot`, so the same staleness was
silently dropping backfilled values from statistics for any entry that had
survived a migration.

**Decision:** given a choice between (a) a small fix that keeps eager
migration and closes the staleness/validation inconsistency, or (b) a much
bigger rewrite to true immutable per-entry schema versioning with read-time
reconciliation everywhere, the project owner chose (a) for performance —
eager migration does the work once, at edit time, rather than reconciling
on every read.

**Changed:**

- `backend/app/routers/projects.py` — `_replace_schema` now refreshes
  `entry.schema_version`/`entry.schema_snapshot` to the new schema for
  every entry it migrates, using the same `new_version` it assigns to the
  project. `update_entry` now validates against `project.entry_schema`
  (current) instead of the stale snapshot; docstring updated to match.
- `backend/tests/test_entries.py` — the existing test rewritten
  (`test_update_entry_validates_against_the_current_schema_after_a_change`)
  to assert the corrected behavior (stale shape rejected, current shape
  accepted), plus a new test confirming an entry's own
  `schema_version`/`schema_snapshot` are refreshed by a migration.
- `backend/tests/test_statistics.py` — two existing tests
  (`test_field_statistics_respect_historical_schema_versions`,
  `test_field_timeline_respects_historical_schema_versions`) updated: they
  were passing only because they encoded the same staleness bug from the
  statistics side (a backfilled value silently uncounted; an entry's
  reported schema_version never advancing). **Flagged to the project
  owner and explicitly approved before touching Person 3/Ronald's test
  file** — no changes to `statistics.py` itself were needed or made, only
  to what the tests assert the (now more accurate) output should be, with
  a comment on each explaining why.
- `backend/tests/test_structured_search.py` (from Story 1, US-3.11) —
  one of my own tests changed behavior as a direct consequence of this
  fix: an entry backfilled by a later schema change now correctly gets a
  refreshed snapshot too, so it *does* answer a search condition on the
  new field (previously excluded, which was the bug). Rewrote the test to
  assert the corrected inclusion, and added a separate unit-level test
  exercising `search.py`'s own defensive fallback (excluding a condition
  on a field genuinely absent from a hand-crafted snapshot), since that
  fallback is still correct and worth covering even though the staleness
  gap it originally demonstrated can no longer occur through the normal
  API path.
- `docs/api/entries.md`, `docs/api/schema.md` — updated to state plainly
  that an entry's schema_version/schema_snapshot move forward with every
  migration that touches it, not just at creation.

**A mistake made and caught during this story:** I initially also reworded
`_validate_entry_data`'s "Unknown field: {id}" error into a plainer
sentence, since the project owner asked for error messages a non-technical
person could understand. Running the full test suite caught that this
detail string is a *shared* contract: `frontend/src/offlineSync.js`'s
`classifyFailure` pattern-matches the literal text "Unknown field" to
decide whether a queued offline entry needs the user's attention or can be
retried, and the import/transfer error format
(`docs/api/transfer.md`) embeds the same string. Reworded the message
without first checking who else depended on its exact text — reverted it
immediately once the full suite (not just the backend) surfaced the
problem. Left as a note for later: this wording *should* eventually be
improved, but as its own change that updates every dependent call site
together, not as a one-line aside inside an unrelated fix.

AI-assisted: investigation, plan, implementation and tests with Claude
Code (Sonnet 5). The plan was reviewed independently before implementation
(also Sonnet 5, fresh context) — it verified every factual claim against
the actual code, confirmed both `PUT /projects/{id}` and
`PUT /projects/{id}/schema` route through the same fixed function, and
caught the statistics-test breakage by actually applying the patch and
running the suite rather than reasoning about it abstractly. That's the
finding that was escalated to the project owner before the statistics test
file was touched.

<!-- Per-story sections appended below as each story completes. -->
