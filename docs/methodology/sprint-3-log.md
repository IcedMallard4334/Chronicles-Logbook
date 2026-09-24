# Sprint 3 — Person 4's Work Log & AI Declaration

Person 4's running log for Sprint 3: what changed, why, and which parts were
AI-assisted. Kept incrementally, one section per story, as the work happens
— this is the paper trail for the course's AI Declaration requirement (tool,
model, purpose) for everything in this workstream.

**Tool:** Claude Code · **Model:** Claude Sonnet 5 · **Branch:** `feat/person4-sprint3`

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
- Branched `feat/person4-sprint3` off that updated `main` — **not** off
  the recovery snapshot — so this branch's history stays scoped to this
  workstream's own stories rather than inheriting six other people's
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

## 3. Shared projects: invite, accept/decline, and leave

**Permission model confirmed with the project owner before implementing:**
owner controls the project itself (schema, archive, delete, rename,
membership); any accepted member can read the project and create entries;
a member may edit/delete an entry only if they wrote it themselves —
editing someone else's entry, even as an accepted member, needs to be the
owner. This is *more* restrictive than a recovered draft from an earlier,
abandoned session (which allowed any accepted member to edit/delete any
entry) — the owner explicitly chose the stricter model when asked.

**Source:** mostly ported and adapted from that recovered draft (never
merged, sitting only in another branch's history — see the Sprint 3 log's
opening section) after reviewing it file-by-file, rather than
reimplemented from scratch: the invite/accept/decline/leave mechanics, the
migration, and — during planning, corrected by an independent review of my
own plan — the per-entry authorship check (`_get_writable_entry`) were
already there and already matched what the owner asked for. My own
contribution was porting it correctly onto this branch (which already had
the US-3.11 and schema-snapshot fixes from stories 1–2), two security
fixes the port needed that the reference draft already had but my initial
plan omitted (`_get_readable_project` and `list_projects` both needed a
`status == accepted` filter added to their membership joins — without it,
a pending or declined invitee keeps full read access, silently defeating
"nothing reaches the invitee's workspace until they accept"), updating the
existing 18 grant-based `test_sharing.py` tests to the new invite/accept
two-client pattern rather than just appending new ones, a new test for
idempotent re-invite of an already-pending member, and a new test for the
delete-entry 403 case the reference tests didn't cover.

**Changed:**

- `backend/app/models.py` — `ProjectMember` gains `status`
  (pending/accepted/declined, defaulting to *accepted* for the migration
  so already-shared projects don't lose access), `invited_by`,
  `responded_at`.
- `backend/migrations/008_project_invitations.sql`, and the matching
  fallback columns in `main.py`'s startup schema patch (the project's
  existing "add missing columns on boot" mechanism, since there's no
  migration runner yet — kept in step the same way every other column
  added since Sprint 1 has been).
- `backend/app/routers/invitations.py` (new) — list/accept/decline.
- `backend/app/routers/projects.py` — `share_project` now creates a
  pending invitation (idempotent: re-inviting a pending member is a
  no-op, re-inviting a declined one resets to pending); new
  `leave_project`; `list_project_members` reports status; `_get_writable_entry`
  gates `update_entry`/`delete_entry` (now reachable by accepted members,
  previously owner-only) to the owner or the entry's own author.
- `backend/app/schemas.py` — `ProjectMemberResponse` gains
  `status`/`invited_at`; new `ProjectInvitationResponse`.
- `backend/tests/test_sharing.py` — 33 tests (30 ported/adapted + 3 new).
- `frontend/src/Invitations.jsx` (+ .css, .test.jsx) — the notification
  bell; ported essentially as-is.
- `frontend/src/App.jsx` — wired `<Invitations>` into the top bar;
  `ShareProjectPanel` now shows each member's status and its copy no
  longer implies immediate access; added a "Leave project" action (with a
  confirm prompt) to a member's view of a shared project, which didn't
  exist in the reference draft's App.jsx and had to be built fresh against
  this branch's actual `ProjectDetail` component.
- `frontend/src/api.js` — `leaveProject`, `fetchInvitations`,
  `acceptInvitation`, `declineInvitation`.

**Not changed:** `tasks.py` needed nothing — it already used the same
`_get_readable_project`/owner-only split this story relies on (members can
see/add/toggle tasks; only the owner can rename or delete one), confirmed
by running the ported task-sharing tests rather than assumed.

AI-assisted: porting, the two security-join fixes, the authorization
model change, the "Leave project" UI, and all test work done with Claude
Code (Sonnet 5). The plan was reviewed independently before implementation
(also Sonnet 5, fresh context) — it corrected a factual error in my own
plan (I believed the authorship check needed to be written from scratch;
it was already in the reference draft and just needed porting) and caught
both missing status-filter fixes before any code was written.

## 4. Page transition animations (polish item)

**Before:** switching tabs or projects replaced the main content in one
frame — no transition, and the only loading state anywhere in the app shell
was a plain "Loading…" paragraph.

**Source:** `ViewTransition.jsx`/`.css` ported essentially unchanged from
the recovered draft (reviewed earlier in this log's opening section) —
already matches the landing page's flowing-line motif (confirmed by
grepping `AuthPage.css` for the same `stroke-dasharray` technique before
trusting the component's own claim to that effect), already handles
`prefers-reduced-motion`, already uses the app's existing theme tokens
(`--blue`, `--mauve`, `--surface-soft`) so it follows accent/dark-mode
changes for free.

**Changed:**

- `frontend/src/ViewTransition.jsx` (+ .css) — three exports: `ViewTransition`
  (a keyed wrapper that remounts on `viewKey` change, restarting a ~300ms
  entrance animation — `key` is the whole mechanism, no state or timers),
  `ViewLoader` (the flowing-line loading state, delayed by default so a
  fast response never flashes it), `SkeletonRows` (placeholder rows,
  unused until Story 5 wires it into actual data-fetching views).
- `frontend/src/App.jsx` — the main content switch is now wrapped in
  `<ViewTransition viewKey={`${currentView}:${view}:${selectedId || "none"}`}>`,
  so switching tabs, toggling the timeline, or opening a different project
  all animate; the plain-text initial loading state became
  `<ViewLoader label="Opening your logbook…" delay={0} />` (`delay={0}`
  since there's nothing to show yet — no reason to wait before showing it).
- `frontend/src/ViewTransition.test.jsx` (new, no reference test existed) —
  7 tests: children render, remount-on-key-change vs. no-remount-on-same-key
  (proven via a mount-count probe, not just visual inspection), the loader's
  delay behavior, its `aria-live="polite"` status role, and SkeletonRows'
  row count.

**Scope note:** `SkeletonRows`/`ViewLoader` are shipped in this commit but
only wired into the app's initial-load state so far — wiring them into
individual views' own data fetches (the actual "skeleton loading
placeholder... during data fetches" requirement) belongs to Story 5
(US-3.17), which is next.

AI-assisted: porting, wiring, and the test file written with Claude Code
(Sonnet 5).

## 5. US-3.17 — Perceived performance & Lighthouse pass

**Investigation (root cause, before any fix):** ran Google Lighthouse
(installed locally — `npm install lighthouse chrome-launcher`, driven
against a local Chrome install, mobile preset, standard simulated
throttling — the same default most Lighthouse/PageSpeed Insights runs use)
against the live site's landing page, the only page reachable without real
account credentials (this sandbox has no way to complete a real Google
OAuth sign-in against production, and the local dev-login script only
works against a local backend/database, confirmed by reading it before
relying on it):

| Metric | Live site (`/`) |
|---|---|
| Performance score | 60/100 |
| LCP | 8.2s |
| FCP | 6.6s |
| CLS | 0 (already fine — not the problem) |

Traced the actual network waterfall rather than guessing: the document and
all network requests finish loading by ~1.3s, but first paint doesn't
happen until 6.6s — so the bottleneck isn't network or a slow API, it's
what the browser has to do with what already arrived. `main.jsx` statically
imports `App.jsx` (which imports `recharts`, `CalendarView`, the AI
assistant, everything) into one 737KB bundle — loaded and parsed even for
someone who hasn't signed in yet and is only looking at the sign-in page.
`unused-javascript` audit: 553KB (75%) of that bundle unused on this page.
No route-based code splitting existed anywhere (`vite.config.js` has no
manual chunking; `main.jsx` had no `React.lazy`/`Suspense`). This is a
frontend build/bundling problem, not a backend data-fetching one — checked
that possibility first per the project owner's instruction, and the
`server-response-time` and `network-server-latency` audits both came back
fine (180ms/597ms respectively).

**Fix:** `frontend/src/main.jsx` — every route except the landing page
(`AuthPage`, static import, unavoidable — it's the first thing an
unauthenticated visitor sees) converted to `React.lazy()`, wrapped in a
single `<Suspense fallback={<ViewLoader delay={0} />}>` around the router.
`MiraConsentGate` (a named export used to wrap the lazy `App`) split out via
`.then(module => ({ default: module.MiraConsentGate }))` since `React.lazy`
only resolves default exports.

**Measured result** (built locally, served via `vite preview`, audited with
the same Lighthouse config before and after — a real before/after on
identical infrastructure, not a live-site re-run, since the fix isn't
deployed):

| Metric | Before | After |
|---|---|---|
| Performance score | 83 | 93 |
| LCP | 3.7s | 2.6s |
| FCP | 3.1s | 2.6s |
| Total Blocking Time | 40ms | 0ms |
| CLS | 0 | 0 |

(These local numbers are lower than the live site's 8.2s/6.6s because they
don't include the live site's real network distance to Azure UAE-North —
the fix addresses the CPU/bundle-parsing bottleneck specifically, which is
additive to and independent of that network cost, so the live site should
see a comparable multi-second drop once deployed, but that can only be
confirmed by re-running Lighthouse against the live URL after this branch
ships.)

Build output confirms the split: the landing page's critical JS dropped
from 764KB to 237KB (`index-*.js`); the 499KB app chunk (`App-*.js`) still
exists but now only loads once a signed-in visit reaches `/app`.

**Skeleton loading placeholders (the other half of this story's AC1):**
audited every major view's loading state before touching anything —
`BoardView`, `OutstandingPage`, `TaskPanel`, `TodayPage`, `CalendarView`,
`ProfilePage` already show an explicit "still loading" message
(`role="status"`), and `HomeWorkspace` already had its own bespoke skeleton
placeholder. All already satisfy AC1 as written ("skeleton placeholders
*or* an explicit still-loading message"). Upgraded one — `EntriesPage`
(`WorkspacePages.jsx`, my own code from Story 1) — from plain "Loading
entries…" text to `SkeletonRows`, both because a table view suits row
placeholders better than a message and to actually put `SkeletonRows`
(shipped in Story 4, unused until now) to use somewhere. Didn't rewrite the
other views' already-adequate loading states — proportionate to what the
acceptance criterion actually asks for, not a blanket redesign.

**Independently re-measured** (fresh agent, own `vite preview` instance, two
separate Lighthouse runs): Performance 92–93, LCP 2.6–2.8s, FCP 2.6s, TBT
0ms, CLS 0 both times — closely reproduces the numbers above. Honest
caveat: LCP sits right at Google's 2.5s "good" boundary, not cleanly under
it — a real, large improvement (8.2s → ~2.7s), not a fully "solved"
number. Further gains from here would mean shrinking the 499KB app chunk
itself (recharts is a likely next target), which is follow-up work, not
done in this pass.

**Also flagged:** `main.test.jsx` mocks `react-dom/client` entirely, so it
never actually exercises Suspense/lazy resolution — it's a smoke test that
the module imports without throwing, not real coverage of the lazy-loading
behavior. The practical verification here came from Lighthouse actually
loading the built app in real Chrome across multiple routes without
errors, which is meaningful evidence but not a substitute for a real test;
noted rather than quietly left uncovered.

**Known follow-up, not done here:** re-running Lighthouse against the live
URL once this branch is deployed, to confirm the same improvement holds
with real network latency included, and to audit the authenticated `/app`
pages directly (blocked in this session by not having real account
credentials for the live deployment).

AI-assisted: the Lighthouse investigation (tooling setup, trace analysis,
root-cause tracing), the code-splitting fix, and the before/after
measurement were done with Claude Code (Sonnet 5).

## 6. US-3.19 — Accessibility

**Investigation, broader than a source-code skim:** set up the full local
stack (backend on SQLite, frontend dev server) specifically to get real
automated coverage of the *authenticated* app, not just the public landing
page — `dev_login.py` mints a valid session against a local database, and a
throwaway seed script populated two projects with a rich schema (text,
number, dropdown, tags, checklist, date fields), several entries and tasks,
so the pages being audited had real content rather than empty states. Ran
Google Lighthouse's accessibility category (axe-core based) against the
live landing page and, via a local scratch harness page injecting the
minted token into `localStorage` before navigating (the same pattern as the
`__flow.html`/`__probe.html` files already in this repo's history, deleted
again immediately after use — never committed):

| Page | Accessibility score |
|---|---|
| Landing (`/`, live site) | 100 |
| `/app?view=entries` | 100 |
| `/app?view=board` | 100 |
| `/app?view=calendar` | 100 |
| `/app?view=today` | 100 |
| `/app?view=outstanding` | 100 |

Zero failing audits anywhere. Manually verified past what automated tools
catch:

- **Alt text (AC1):** every `<img>` has an `alt` attribute; the ones using
  `alt=""` (the logo mark, user avatars) are deliberately decorative or
  redundant, each confirmed to have adjacent identifying text (`aria-label`,
  `title`, or a visible name right next to it) by reading the surrounding
  JSX — not assumed.
- **Colour-only status (AC2):** hunted specifically for this since it's the
  AC's explicit callout. Found small coloured indicators (`.is-overdue`,
  status badges) but every one is paired with an adjacent text label
  ("Overdue", "Invited", "Declined") — none are colour-only.
- **Screen reader flows (AC3) — the real gap found:** every `role="dialog"`
  in the codebase (9 instances) has correct ARIA structure
  (`aria-modal`/`aria-labelledby`), but most had *no keyboard focus
  management* at all: no initial focus into the dialog, inconsistent
  Escape-to-close, no Tab trap (so Tab could reach elements behind a
  backdrop `aria-modal="true"` claims are hidden from assistive tech — a
  real contradiction between the ARIA promise and actual behaviour), and no
  focus returned to the trigger on close. This is the category of bug
  automated tooling structurally can't catch (it only sees static markup,
  not dynamic focus behaviour), which is why the Lighthouse 100s didn't
  flag it.

**Fix:** a single shared hook, `frontend/src/useDialogFocus.js`, wired into
8 of the 9 dialogs (`DayActivityDialog.jsx` excluded — it already uses a
native `<dialog>` + `showModal()`, which gives it trapping/Escape/restore
for free; bolting the hook on would have been redundant and risked
double-handling). Plan reviewed independently before implementation, which
caught real per-call-site mismatches the generic plan didn't originally
account for:

- `ProfilePage.jsx`'s `DeleteAccountModal` has no `isOpen` prop (only
  mounted while open) — needed `useDialogFocus(true, onClose)`.
- `DataTransfer.jsx`'s modal visibility is `Boolean(summary || error)`, and
  its `onClose` prop means "close the parent dropdown", not "close this
  dialog" — Escape needed a local wrapper that also clears `summary`/`error`
  the same way the Close button already does, or it would skip the state
  clear.
- `CommandPalette.jsx` renders *either* its trigger *or* its dialog, never
  both — the trigger button unmounts in the same commit that opens the
  dialog, so by the time the hook's effect runs to capture
  `document.activeElement`, that button is already gone and the capture
  falls back to `document.body`. On close, focus isn't programmatically
  returned to the (newly remounted) trigger — a real, independently
  confirmed (tester ran the code, not just reasoning about it) but minor
  gap: nothing traps focus and Tab still works, so a keyboard/screen-reader
  user isn't stranded, but their tab position resets rather than resuming
  at the trigger. A precise fix exists (capture the trigger in the click
  handler itself, before it unmounts, rather than relying on the generic
  hook's after-the-fact `document.activeElement` read) but wasn't done in
  this pass — logged as a known follow-up rather than silently left
  looking like an oversight, in the interest of finishing all 8 stories in
  this sprint rather than gold-plating one call site.
- **Corrected after independent testing:** I originally believed
  `Invitations.jsx` had the same trigger-unmount issue as CommandPalette.
  It doesn't — the bell button is always mounted (a sibling of the
  conditionally-rendered panel, not replaced by it), so
  `document.activeElement` is captured correctly and focus returns to the
  real trigger on close. Verified by the tester actually reading the JSX,
  not by re-asserting my own earlier claim.
- `Invitations.jsx`'s panel has no backdrop and no `aria-modal` — a
  non-modal popover, not a blocking dialog — so it gets initial focus and
  Escape but *not* a Tab trap (`{ trap: false }`), so the rest of the page
  stays reachable while it's open.
- Added `aria-describedby` linking the two delete-account dialogs
  (`App.jsx`'s and `ProfilePage.jsx`'s) to their warning text — `autoFocus`
  was sending a screen reader straight to the "type DELETE" input, past the
  "this cannot be undone" warning, which a dialog announcement alone
  doesn't reliably surface.

**A bug I caught myself before it shipped:** every real call site passes a
fresh inline `onClose` function on every render (none memoise with
`useCallback`). My first draft of the hook had `onClose`/`trap` in the
effect's dependency array — which meant the "move focus to the first
field" effect would re-run on *every keystroke* inside a dialog with a
form (typing in `CreateProjectModal`'s name field would have yanked focus
back to itself after each character, making it unusable). Fixed with the
standard "latest ref" pattern — the effect now depends only on `isOpen`,
reading the current `onClose`/`trap` from a ref updated every render.
Added a regression test for this specifically (`useDialogFocus.test.jsx`),
then verified the test actually catches it: reverted to the buggy
dependency array, confirmed the test failed with focus landing on the
wrong field, restored the fix, confirmed green again.

**Tests:** `useDialogFocus.test.jsx` (8 tests: initial focus, Escape,
focus-return, Tab trap both directions, `trap:false`, no-focusable-children
safety, the re-render regression above) plus targeted integration tests
added to the existing suites that most needed them —
`DataTransfer.test.jsx` (Escape actually clears the summary, not just
visually), `Invitations.test.jsx` (Escape closes without answering) — and
a new `CommandPalette.test.jsx` (5 tests), since that component had *zero*
prior test coverage despite being touched directly by this change.

AI-assisted: the local authenticated-audit setup, Lighthouse investigation,
manual accessibility review, the shared hook, all 8 call-site integrations,
and the tests were done with Claude Code (Sonnet 5). The plan was reviewed
independently before implementation (also Sonnet 5, fresh context), which
found the `ProfilePage`/`DataTransfer`/`CommandPalette`/`Invitations`
call-site mismatches above, recommended excluding `DayActivityDialog.jsx`,
and caught the missing `aria-describedby` — all fixed before or during
implementation, not discovered after.

## 7. US-3.23 — First-time login onboarding

**Source:** ported essentially unchanged from the recovered draft covered
in this log's opening section (`GuidedTour.jsx`, `GuidedTour.css`,
`tourSteps.js`, and a 13-test `GuidedTour.test.jsx` that already existed) —
reviewed the component before trusting it, same as every other piece of
that draft: it already does its own focus management (moves focus onto
the tour card, Escape/Arrow-key navigation, `role="dialog"
aria-modal="false"` since a coach mark deliberately doesn't block the page
it's explaining), so it needed nothing from Story 6's `useDialogFocus` —
different UX pattern, correctly self-contained. Confirmed the tour's four
CSS anchor selectors (`.workspace-sidebar-nav`, `.sidebar-head`,
`.nav-pill-center`, `.nav-pill-right`) still exist on this branch before
trusting the port, since a lot has changed since that draft was written.

**Wiring (the actual work in this story, since the tour components
themselves were already done):**

- `App.jsx`: a one-time `WelcomeTour` shown once loading finishes and
  `"welcome"` isn't in `seenTours()`; a `PageHint` for the current
  top-level view (`currentView`, or `"timeline"` when the timeline toggle
  is active — this branch keeps that as a separate `view` state rather
  than folding it into `currentView`, unlike the recovered draft, so the
  wiring maps both into one lookup key rather than assuming one variable).
  Page hints are suppressed while the welcome tour is still showing, so
  they never overlap.
- `ProjectDetail` (also in `App.jsx`): the same pattern scoped to a
  project's own tabs (`PROJECT_TOURS`, keyed by `tab`) — schema, entries
  and tasks each get a one-time coach mark the first time that tab is
  opened, satisfying "contextual guidance the first time a user visits
  each major page/section" for sections *within* a project, not just the
  app's top-level views.
  `seenTours()` reads `localStorage` fresh on every call (cheap, and the
  source of truth already lives there since `PageHint`/`WelcomeTour` call
  `markTourSeen` themselves on dismiss) — so showing/hiding a hint after
  it's dismissed just needs *something* to trigger a re-render; three
  small "tick" counters (`welcomeTick`, `hintTick`, `projectHintTick`) do
  that without duplicating the seen-state into component state, which
  could drift from what's actually persisted.
- `ProfilePage.jsx`: a "Replay tour" row in Workspace settings — the
  "reopened from a help menu" requirement — calls `resetTours()` then
  navigates to `/app`, where the same `seenTours()` check picks the reset
  straight back up.

**A real bug caught by independent testing:** `showProjectHint` (inside
`ProjectDetail`) wasn't gated on the top-level `showWelcome`/`showPageHint`
at all. Reachable sequence, confirmed by the tester tracing the actual
code rather than reasoning abstractly: welcome tour already seen → the
Home page's own hint is showing, not yet dismissed → user opens a project
anyway (`PageHint` deliberately has no scrim — "this arrives while
somebody is already doing something", so nothing blocks that click) →
`ProjectDetail` mounts with its own `project-entries` hint, which had no
way to know the page-level hint was still on screen. Two `tour-layer`
overlays end up rendered at once, each grabbing focus on mount. Fixed by
passing a `hintsSuppressed={showWelcome || showPageHint}` prop down into
`ProjectDetail`, which now treats its own tour lookup as `null` while
either is true — closing the gap without needing the project-level hint
to know anything about the app-level state beyond that one boolean.

**Tests:** the 13 ported tests cover the tour mechanics directly
(remembering/forgetting what's been seen, per-account scoping, storage
failures, anchor-skipping, Escape, dismiss-and-remember) but — as the
tester correctly pointed out — none of them exercised the actual
`App.jsx`/`ProjectDetail` wiring, which is exactly where the bug above
was. Added two tests to `App.test.jsx`: the welcome tour genuinely doesn't
re-render once `seenTours()` says it's been seen, and (the regression test
for the bug itself) opening a project while the Home page hint is still
showing leaves exactly one `.tour-layer` on screen, not two.

**Known limitation, documented rather than fixed:** the tour's own
Escape/Arrow-key handling (a `window`-level listener, independent of Story
6's `useDialogFocus`) and a real modal's Escape handling (a
`document`-level listener via the hook) can both be listening at once —
if a `PageHint` is showing and something opens `CreateProjectModal` or
`CommandPalette` on top of it (both reachable, since the hint has no
scrim), a single Escape keypress dismisses both and permanently marks the
hint as seen as a side effect. Not a crash, and narrow (needs two specific
things open at once before Escape is pressed), so left as a documented
edge case rather than building cross-cutting "is any modal currently open"
tracking to close it — the cost didn't seem proportionate to how often
it's actually reachable.

AI-assisted: porting, the App.jsx/ProjectDetail/ProfilePage wiring, the
bug fix and its regression tests, and verification all done with Claude
Code (Sonnet 5). The implementation was reviewed independently after
being built (also Sonnet 5, fresh context), which is what found the
double-overlay bug, confirmed the test gap around it, and surfaced the
Escape-coupling edge case above.

## 8. US-3.24 — Theme-aware background

**Investigation first:** before writing anything, checked whether the
"applies immediately and persists across sessions" half of this story was
already solved — it was. `preferences.js`'s `applyPreferences()` (called
by every theme/accent control in `ProfilePage.jsx`) sets
`document.documentElement.dataset.theme`/`.dataset.accent` immediately,
and `savePreferences()`/`updateAccent()` write the same values to
`localStorage` first. That infrastructure already existed and needed no
changes — this story was specifically "the *background* doesn't follow
that yet", not "theme switching doesn't persist".

**Source:** `AmbientBackground.jsx`/`.css` ported unchanged from the
recovered draft — four hand-drawn scenes (one per accent: Chronicles'
folded violet planes, Ocean's swelling water, Forest's canopy and light
shafts, Rose's generated-but-stable falling petals), watching
`documentElement.dataset.accent`/`.dataset.theme` via a `MutationObserver`
rather than needing any prop threaded down to it — confirmed the accent
ids in `SCENES` (`chronicles`/`ocean`/`forest`/`rose`) exactly match
`ACCENTS` in `preferences.js` before trusting the mapping. Drawn with CSS
gradients/SVG rather than photographs (instant, no second asset per accent
to keep in sync, scales to any viewport), `aria-hidden="true"` and
`pointer-events: none` throughout (purely decorative — never intercepts a
click, never read out — consistent with the accessibility pass in Story
6), and already handles `prefers-reduced-motion` and dark-mode dimming via
both a `prefers-color-scheme` media query and an explicit
`[data-theme="dark"]` override, matching how the rest of this app's
theming already works in both directions.

**Wiring:** one line — `<AmbientBackground />` mounted once, as the first
child of `App()`'s `app-shell`, sitting behind the existing
home-view-specific wave decoration (`app-bg-dynamic`) rather than
replacing it — that decoration is scoped to the Home workspace only and
unrelated to theming, so it was left untouched and simply now has this as
its backdrop instead of the shell's plain background colour on every
other view too.

**Tests:** no reference test existed for this component, so wrote one —
7 tests: defaults to the Chronicles scene, renders the scene matching
whatever accent is already on the page, switches scene live when the
`data-accent` attribute changes (the exact mechanism `ProfilePage`'s
accent selector uses — not simulated some other way), doesn't break when
`data-theme` changes instead, falls back gracefully for an unrecognised
accent value, is confirmed decorative (`aria-hidden`), and checks the Rose
scene's generated petal layout isn't accidentally collapsed to one
repeated position.

AI-assisted: porting, wiring, and the test file all done with Claude Code
(Sonnet 5). Verified independently (also Sonnet 5, fresh context), which
confirmed the persistence chain end-to-end — including `main.jsx` seeding
the accent/theme attributes before React ever mounts, so first paint is
already correct rather than flashing the default scene — and mutation-
tested the "switches scene live" test to confirm it isn't a tautology.
One pre-existing, out-of-scope observation surfaced along the way:
`ProfilePage.jsx`'s `cycleTheme` duplicates `applyPreferences`'s logic
inline instead of calling it, rather than a bug — noted rather than
touched, since consolidating it isn't what this story asked for.

All 8 stories above are complete. The sections below are follow-up work
requested afterwards, outside the numbered story list but logged the same
way.

## 9. Follow-up: a local sign-in that doesn't depend on Google OAuth working

**The problem, as reported:** running the app locally kept blocking sign-in.
**Root cause:** the team's shared Google Cloud OAuth client only has
`http://localhost:8000/auth/google/callback` registered for whoever
administers it — `GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET` being unset or
pointed at a client without a developer's own redirect registered makes
"Continue with Google" a dead end for anyone else on the team, by design of
how OAuth clients work, not a bug in `auth.py`.

**Fix:** a backend-gated bypass, off everywhere except a developer's own
machine.

- `backend/app/config.py` — `ENABLE_DEV_LOGIN`, read from the environment,
  defaulting to `false`.
- `backend/app/routers/auth.py` — `POST /auth/dev-login`: answers 404 (not
  503, so its existence isn't even revealed) unless `ENABLE_DEV_LOGIN` is
  true; otherwise finds-or-creates a `User` by email and returns a real
  session through the same `_create_login_session`/`_auth_response` path
  `google_callback` uses, so a dev-login session is indistinguishable from a
  real one anywhere else in the app.
- `backend/app/schemas.py` — `DevLoginRequest` (`email`, `full_name`, both
  optional; `extra="forbid"`).
- `backend/.env.example`, `docs/getting-started/running.md`,
  `docs/architecture/authentication-and-azure.md` — documented, with an
  explicit warning never to set `ENABLE_DEV_LOGIN` in Azure Application
  Settings.
- `frontend/src/AuthPage.jsx` (+ `.css`) — a "Local development" panel below
  the Google button, gated on `import.meta.env.DEV` so Vite dead-code-
  eliminates it out of a production build entirely (verified: the string
  "Continue without Google" is absent from every file in a `npm run build`
  output). Submits to the new endpoint via `api.js`'s `devLogin`, then routes
  to `/setup` or `/app` the same way `AuthCallback` does for a real sign-in.

**Verified for real, not just by unit test:** built the frontend and grepped
the output for the panel's own text (absent, confirming the dead-code
elimination claim); started a real local backend against the real local
Postgres database with `ENABLE_DEV_LOGIN=true` and drove it end-to-end with
headless Chrome (`chrome.exe --headless --screenshot`) — minted a session,
landed on the real first-time setup wizard, and confirmed the panel renders
correctly in both light and dark mode.

**Caught by that manual pass, not by any test:** the backend-vs-frontend
troubleshooting needed to even get a working local screenshot surfaced a
real, pre-existing footgun worth recording — `CORS_ORIGINS` and
`VITE_API_URL`/backend port must agree, and a mismatch fails as "Cannot
reach the server to restore your session" in the UI, which reads like a
dead backend rather than a CORS rejection. Not fixed (it's how CORS
inherently works, already documented in `running.md`'s "CORS errors that are
not CORS errors" section), but worth knowing if this bypass ever seems not
to work: check the frontend's origin is in the backend's `CORS_ORIGINS`
before assuming `ENABLE_DEV_LOGIN` itself is broken.

**Tests:** `backend/tests/test_dev_login.py` (6 tests: 404 by default,
create/reuse/normalise-email, token actually authenticates against
`/auth/me`), `frontend/src/AuthPage.test.jsx` (6 new tests: panel presence,
its absence with `import.meta.env.DEV` stubbed false — the executable form
of the dead-code-elimination guarantee above — success/redirect routing for
both a returning and a brand-new account, the typed email/name are what get
sent, and the plain-language message shown when the backend hasn't enabled
it). Both the backend gate and the frontend gate were mutation-tested
(commented out/stubbed true, confirmed the relevant test fails, restored).

AI-assisted: investigation, implementation, tests, the manual Chrome-driven
verification, and docs were done with Claude Code (Sonnet 5).

## 10. Follow-up: a searchable in-app Help manual

**Ask:** a Help manual covering how to use the app, every feature, and what
each schema field type means with an example of when to use it — searchable,
matching the app's existing look in both light and dark mode.

**Content — researched, not invented:** a fresh-context research pass (also
Sonnet 5) read the actual frontend/backend source for every feature (routing,
`fieldTypes.js`, `search.py`, the sharing permission model, offline sync,
Mira's consent gate, calendar integration, etc.) and cross-checked it
against `docs/api/*.md`, producing `frontend/src/helpContent.js`: 18
sections, 26 articles. Spot-checked afterwards against the live source
rather than trusted outright — every quoted button/label string
("Filter by custom field", "Save these filters as", "Mira permissions",
"Invite by email", etc.) was grepped against the actual JSX and found
verbatim. The research pass also flagged, honestly, two things it described
conservatively because the UI doesn't back them up: there is no delete/edit
button for an already-saved entry anywhere in the interface, and the
backend's CSV export (`fetchProjectCsv`) has no UI caller at all — confirmed
independently (`grep` across every `.jsx` file) before rewriting the CSV
article to say so plainly rather than implying a button that doesn't exist.
No dedicated "Statistics" page exists either, despite one being referenced
in `tourSteps.js`'s dead `PAGE_TOURS.statistics` key — the manual describes
only what's actually reachable (Home's workspace totals and the
Home→Activity field-timeline chart).

**Page:** `frontend/src/HelpPage.jsx` (+ `.css`), routed at `/help`
(protected, lazy-loaded like every other route since Story 5). A four-block
content schema (`p`/`ul`/`ol`/`dl`) keeps every article's shape uniform; a
single search box filters the topic list by title and a generous keyword
list per article (so "formula" finds the Calculation field even though the
word "formula" never appears in that article's title). Deep-linkable via
`?topic=<id>` so other entry points can jump straight to a topic.

**Wired in three places:** the account-menu dropdown gained a "Help" item
next to Profile (`App.jsx`), the command palette gained a "Help &
documentation" entry (`CommandPalette.jsx`), and Profile's Workspace
settings gained an "Open help" row next to Replay tour (`ProfilePage.jsx`).

**A real bug, caught only by actually loading the page in a browser:**
`HelpPage.jsx` initially imported only its own `HelpPage.css`, not the
shared `App.css` that defines `.app-shell`/`.topbar`/`.app-bg-dynamic` (every
other full-page route, e.g. `ProfilePage.jsx`, imports both). Nothing in the
automated test suite catches a missing stylesheet import — jsdom doesn't
lay anything out — so this shipped invisibly until a real headless-Chrome
screenshot of the page showed the topbar and content pushed hundreds of
pixels down the page, sitting below the decorative background instead of
above it. Fixed by adding the missing `import "./App.css"`. Also caught in
the same pass: the topic-nav `<ul>` was showing default browser bullets
(`list-style` was never reset) — fixed alongside it. Both re-verified
visually afterwards, in both light and dark mode.

**Tests:** `frontend/src/helpContent.test.js` (6 tests validating the data
itself — every id unique, every block a supported type, every list
non-empty, the field-types glossary specifically covers all 9 real field
types with an example on every one), `frontend/src/HelpPage.test.jsx` (10
tests against a fixed fixture independent of the real content's wording —
default article, topic switching, active-state marking, glossary rendering,
keyword search including a "matches on keywords the title doesn't contain"
case, empty-search messaging, `?topic=` deep-linking, Back navigation). The
search filter was mutation-tested (`matchesQuery` stubbed to always return
`true`, confirmed three tests fail, reverted).

AI-assisted: the content research pass, `HelpPage.jsx`/`.css`, the wiring,
the tests, the bug found and fixed via manual browser verification, and this
log entry were all done with Claude Code (Sonnet 5).

## 11. Follow-up: visual polish and removing a decorative background scene

Three small fixes from a real-app review pass, none touching data or logic:

- **The background's silhouette figures were removed.** `App.jsx`'s
  `app-bg-waves` decoration included a hand-drawn scene of four human
  silhouettes (`wave-silhouettes`), pre-existing from before this sprint —
  reported as looking out of place. Removed the SVG group, its dedicated CSS
  (`.wave-silhouettes`, `.silhouette-scene`, `.silhouette-detail`), and the
  now-orphaned `--silhouette` custom property (all three theme variants).
  Purely decorative and `aria-hidden`, so nothing else referenced it;
  confirmed with `grep` before deleting, and `App.test.jsx` still passes.

AI-assisted: found, confirmed unused elsewhere, and removed with Claude Code
(Sonnet 5).

## 12. Follow-up: entries stay frozen at their own schema; naming, editing and deleting them

**The report, with a screenshot:** after adding a field to a project's
schema, an already-existing entry showed the new field with a blank/dash
value it never actually recorded — Story 2 (section 2 above) chose "eager
migration" for performance, which backfills every entry the moment a schema
is saved. Seeing that in practice, the call was to revisit it: entries
should keep the exact shape they were recorded in until someone explicitly
chooses to update one. Flagged before implementing, since it reopens an
explicit prior decision and touches a lot of existing test coverage from
earlier in this workstream (and, with permission, one other team member's
Sprint 2 area) — confirmed before making the change.

**The new rule:** a schema save changes the *project* only
(`entry_schema`/`schema_version`). No entry is touched. An entry's own
`schema_snapshot` moves forward only when that one entry is individually
edited with `migrate_to_current_schema: true`. This actually removes a
standing inconsistency rather than trading one for another: previously,
`entry.data` moved forward eagerly at schema-save time while nothing forced
`entry.schema_snapshot` to agree with it except a second, separate write in
the same transaction — the exact seam Story 2 had to patch. With neither
touched until an explicit per-entry migration, the two can never drift apart
in the first place.

**Changed, backend:**

- `app/schema_migration.py` — `describe_changes()` takes a `scope`
  (`"project"` vs `"entry"`) and returns different, accurate wording for
  each, since the same diff function now backs two genuinely different
  claims: what changes for *new* entries (schema save) vs. what changing
  *this* entry's shape right now would do (an edit that migrates). New
  `simulate_entry_migration()` reuses `describe_changes`/`migrate_entry_data`/
  `_count_change` scoped to one entry, migrating from that entry's own
  `schema_snapshot` to a target schema, rather than from the project's
  schema.
- `app/routers/projects.py` — `_replace_schema` no longer loops over
  entries at all; it only bumps `project.schema_version`, sets
  `entry_schema`, and recomputes `retired_schema` (a pure schema diff, no
  entry data needed). `_plan_schema_change` no longer fetches entries,
  since none are simulated — `entry_count` is now a cheap `COUNT(*)` for the
  review screen's "N entries, none of them affected" framing.
  `update_entry` defaults to validating `data` against **the entry's own**
  `schema_snapshot`; `migrate_to_current_schema: true` migrates the entry's
  existing values onto the project's current schema first, layers whatever
  `data` was sent on top (so filling in a new field and migrating happen in
  one request), and only then updates the entry's own
  `schema_version`/`schema_snapshot`. New
  `GET .../entries/{id}/migration-preview` — read-only, entry-level sibling
  of `POST /schema/preview`, so the frontend can show what migrating would
  produce before the user commits to it, the same "preview and apply cannot
  disagree" guarantee schema changes already had.
- `app/models.py`, `migrations/009_entry_title.sql`, `main.py` — `Entry`
  gains an optional `title`, independent of any project's schema, so an
  entry has an identifier that doesn't depend on concatenating whatever its
  first field happens to hold.
- `app/schemas.py` — `title` on `EntryCreate`/`EntryUpdate`/`EntryResponse`;
  `migrate_to_current_schema` on `EntryUpdate`; new
  `EntryMigrationPreview`; `TimelineEntryResponse` (the global-search
  response shape) gains `title`, `schema_snapshot`, `created_by`,
  `created_by_name` — needed so a cross-project entry list can render each
  row against what that entry actually recorded, not assume the project's
  current schema applies uniformly to every row.

**A real, separate bug found only by loading the app for real:** after all
of the above, the "All Entries" table still showed the field-concatenation
preview instead of the title just set. `search_entries` (`GET /entries`)
builds its own response dict by hand rather than returning the ORM `Entry`
directly — pre-existing, and it simply never copied `title`/`schema_snapshot`/
`created_by`/`created_by_name` into that dict, so Pydantic silently filled
in each field's default (`null`/`[]`) instead of erroring. No automated test
was exercising those specific fields on this endpoint before, so nothing
caught it until a real browser check against a real backend showed a title
that wouldn't display. Fixed by copying the four fields across;
`test_search_entries_includes_title_snapshot_and_author` guards it,
mutation-tested (removed the four keys, confirmed the test fails on `title`
being `None`, restored).

**Changed, frontend:**

- `frontend/src/EntryShared.jsx` (new) — `EntryDetailModal` (view, edit,
  the "edit as recorded" vs. "update to current schema" choice — shown only
  when the entry actually is stale — delete with an inline confirm step),
  plus `EntryFieldInput`, `LinkChip`, `useProjectStatuses`,
  `deriveProjectStatus`, `formatEntryValue`, `RetiredValues` and their small
  private helpers (`TagsInput`, `ChecklistInput`, `LinkInput`), moved out of
  `App.jsx` so both `App.jsx` (the per-project entry list) and
  `WorkspacePages.jsx` (the cross-project "All Entries" table) can share one
  modal without a circular import between the two — see the note below on
  how that was found.
- `App.jsx` — `EntryList` now reads each row's own `schema_snapshot`
  (falling back to the project's schema only for a legacy entry that
  predates snapshots), fixing the same "phantom field" rendering bug
  reported in the screenshot on the per-project entries list, not just the
  backend data. A stale entry gets a small "recorded under an earlier
  version…" note. Rows are now a clickable/keyboard-operable
  `role="button"` opening `EntryDetailModal`; the nested `LinkChip` and
  `RetiredValues` `<details>` each stop click propagation so acting on them
  doesn't also open the row. `EntryForm` gained a "Title (optional)" field.
- `WorkspacePages.jsx` — the "All Entries" row's preview text prefers
  `entry.title`; clicking a row looks the entry's project up from the
  already-loaded `projects` list (no extra fetch) and opens the same
  `EntryDetailModal`.
- `EntryFieldInput`'s plain text/number/date input lost its `required`
  attribute — caught by a test that legitimately hung, not by reasoning
  about it first: migrating a new text field backfills it with `""`, which
  is valid data the backend already accepts, but a `required` HTML input
  silently blocks form submission on an empty value before React's own
  handler ever runs. The backend doesn't actually require non-blank text
  for any type this touches, so removing it is a correction, not a
  loosening of a real rule.

**Design note — permissions.** `ProjectResponse` never exposed the owner's
`user_id` to the frontend, only a `shared: bool`. `canManage` for the modal
is therefore `!project.shared || entry.created_by === userId` (owner, or a
member editing their own entry) rather than an id comparison — matches
`_get_writable_entry`'s actual backend rule without needing a new field.

**Tests:** backend — `test_schema_editing.py` substantially rewritten (36
tests: what a schema save does and doesn't touch, per-field description
wording for both scopes, the full migrate-on-edit flow, the
migration-preview endpoint); `test_entries.py`,
`test_statistics.py`, `test_structured_search.py` updated where they had
encoded the old eager-migration behavior as their expected result (each
with a comment explaining the corrected expectation); `conftest.py` fixed
to explicitly pin `ENABLE_DEV_LOGIN=false` for the test suite — it was
silently inheriting `true` from the real local `.env` (section 9's own
feature, working as intended there), which is exactly the kind of
environment-dependent flakiness a test suite shouldn't have. Frontend —
`EntryShared.test.jsx` (12 tests: view/edit rendering against the entry's
own shape vs. the project's, the stale-entry banner, `canManage` hiding
actions, an ordinary edit's payload, the migrate choice fetching a preview
and pre-filling the form, the migrated save's payload, delete's confirm
step, Escape-to-close). The `update_entry` schema-snapshot default was
mutation-tested (reverted to validating against the project's current
schema, confirmed three tests fail for the right reason, restored).

Backend: 375 passing. Frontend: 424 passing. Both mutation-tested at the
points above.

AI-assisted: the architecture discussion, backend and frontend
implementation, the two real bugs found through actual use (the `required`
hang, the missing-fields dict), the tests, the docs, and this log entry were
all done with Claude Code (Sonnet 5).
