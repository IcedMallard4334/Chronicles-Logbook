# Decisions

Chronicles was built in sprints by several people, and most of what makes it behave the way it does was a
choice: what to store, what to refuse, what to leave out, what not to test. This section writes those choices
down with their reasons, so a marker, a new team member or the team a year from now can tell **what was decided,
why, what it cost, and where it lives**, instead of having to reconstruct it from the code.

| Page | What it covers |
|---|---|
| [Data and backend](data-and-backend.md) | The data model, how a schema change treats existing entries, field limits, history, search and statistics, sharing and permissions, import and export, migrations, sign-in and sessions, external services. Entries `DB-01` to `DB-70`. |
| [Interface and frontend](interface.md) | Forms and fields, drawers, accessibility, Mira and **dictation**, guidance for new people, Learning Chronicles and its videos, look and feel, navigation and phones, offline capture. Entries `UI-01` to `UI-70`. |
| [Platform, delivery and tooling](platform-and-delivery.md) | CI and the self-hosted runner, deployment, the documentation site, dependencies, linting, how the docs are kept true. Entries `PL-01` to `PL-22`. |
| [What we do not test, and why](not-tested.md) | Every area the automated tests do not cover, with the reason, what we do instead, and the risk. Entries `N-01` to `N-17`. |

Other places where decisions are argued at length, which these pages link to rather than repeat:

- [Project Methodology](../methodology/project-methodology.md): why Scrumban, roles, cadence, and the options rejected.
- The sprint meeting pages: decisions `D-001` onwards, with rationale, in
  [Sprint 2 meetings](../methodology/sprint-2-meetings.md) and [Sprint 3 meetings](../methodology/sprint-3-meetings.md).
- [Third-Party Code](../development/third-party-code.md): every package and what it was chosen over.
- [API Performance](../testing/api-performance.md): the hosting region, and why validation errors are `422`.
- [Testing](../development/testing.md): why each testing and linting tool, and the coverage measurement bug.
- [User feedback](../methodology/user-feedback.md): what users asked for, what was built and what was declined.
- [Diagrams](../architecture/diagrams.md): the shapes these decisions produced.

## How an entry is written

Each entry has the same parts:

- **Decided:** the choice, in a sentence.
- **Why:** the reason, in the words of the code comment, commit or document it came from where one exists.
- **Cost / consequence:** what it makes harder, or what was rejected.
- **Where:** the files, so a claim can be checked.

## What the reasons are based on, and what they are not

The reasons come from three sources: comments written next to the code, commit messages, and the existing
documents. They are **not** invented after the fact. Where none of those says why, the entry says *"not
recorded"* instead of offering a plausible story. Examples: why dictation waits 1.4 seconds before ending a
sentence, why short text is 255 characters, why statuses are capped at 8, and why a coverage threshold was never
set. Those are honest gaps, and the people who made those choices are the ones who can fill them in.

Two kinds of entry deserve a second look:

- **Reversals.** Some decisions were made, tried and undone, and the reason for the reversal is the useful part:
  eager migration of entries (DB-10), a screen reader built into the app (UI-16), a hidden heading on every page
  (UI-19), a confirmation card for every Mira action (UI-25), email-and-password sign-in (DB-54).
- **Known limits.** Where a decision has a cost that is still open, it is stated (DB-08, DB-48, DB-51, DB-60).

## Adding to it

Add the entry in the same pull request as the change, to the page that fits, with the next free number. If you do
not know the reason, write that. The checklist is in
[Contributing](../development/contributing.md#keeping-the-documentation-true).

AI Declaration: The preceding section was assembled with Claude Code (Sonnet 5.5) from the repository's code
comments, commit history and existing documents, and checked against the source. It has not yet been reviewed
by the team, who should correct any reason it gets wrong.
