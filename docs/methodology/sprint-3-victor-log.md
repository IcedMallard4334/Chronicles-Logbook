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

<!-- Per-story sections appended below as each story completes. -->
