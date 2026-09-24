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

<!-- Per-story sections appended below as each story completes. -->
