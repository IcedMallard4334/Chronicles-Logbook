# Sprint 2 Retrospective

| | |
|---|---|
| **Sprint** | 2 — 2026-08-26 to 2026-09-15 |
| **Held** | 2026-09-15, immediately after the Sprint 2 Review and Milestone 2 submission |
| **Revisited** | 2026-09-22 at Sprint 3 Meeting 1, once the Sprint 3 planning document was drafted |
| **Format** | What went well / what did not / what we change |

The actions below were first recorded as the "Retrospective Actions" table on
the [Sprint 2 Review](sprint-2-review.md) page; this page is the dedicated
retrospective the Sprint 1 Retrospective established as the team's format,
written up properly rather than left as a table at the bottom of the review.

---

## What went well

**The intermediate tier shipped, plus more than planned.** 22 of 23 planned
stories complete (96%), and the sprint delivered four things beyond the plan
that weren't asked for at kickoff: project sharing with authorship, project
deletion, Mira's consent onboarding, and a verified phone-usable layout. The
PO's Meeting 4 request (sharing) was absorbed into the same sprint rather than
deferred.

**A production incident was caught and fixed the same day, with a
regression test.** The 2026-09-14 schema-drift outage (models had five
columns the deployed database didn't) could have sat undetected for weeks.
Instead it was found, fixed, and given a CI check that fails the build if it
ever recurs — the incident made the pipeline stronger, not just the database.

**Formal user feedback changed the product before the sprint closed, not
after.** Twelve responses on 2026-09-14 found that 58% of users couldn't tell
Entries from Tasks apart; the fix (rewriting both page descriptions to
contrast with each other) shipped the same day, before Milestone 2 was
submitted. Feedback that arrives after the deadline it's meant to inform is
just documentation; this one changed the deliverable.

**The measurement bug taught a real lesson, and it was written down.**
Backend coverage read 74% for most of the sprint because of an untraced
concurrency mode, not a real coverage gap. Finding and fixing that
(93% → 94% real, with no new tests) is now the reason the team checks the
instrument before chasing a number — the lesson is repeated on the
[Testing](../development/testing.md) page, and a Sprint 3 review would still
flag if the same trap were hit again from a different tool.

---

## What did not go well

**"Done on the board" and "done in the product" turned out to be different
claims.** US-2.1 through US-2.3's field editors (tags, checklists, links)
were built, tested, and marked complete — and never wired into the entry
form, which silently rendered them as a plain text box. This sat unnoticed
for roughly two weeks until the 2026-09-14 review, because nobody had
checked the acceptance criteria against the *running app*, only against the
code and its unit tests.

**Three of the sprint's four incidents were deployment, not code.** The
schema drift, the docs-site publish-profile secret losing a character in
transit, and the coverage measurement bug were all found in the "did it
actually ship correctly" gap between writing something and confirming it
runs where a user or a grader would see it. None would have been caught by
writing more unit tests.

**A duplicate migration number reached `main` undetected.** Two feature
branches each numbered a database migration `004`. Conventional Commits (the
Sprint 1 retrospective's action) governs commit *messages*, not the content
of a merge, so it had nothing to say about two migrations colliding — this
needed someone reading the merged diff, which nobody did.

**The Scrum Master rotation planned in Sprint 1 didn't happen.** Nkosinathi
continued in the role through Sprint 2 because he also owned CI/CD, and
Sprint 2's integration problems (six unmerged branches by Meeting 3) needed
the person who understood the build to be the one merging. A defensible
reason in the moment, and a bus-factor risk left unaddressed for a second
sprint running.

---

## What we change

| # | Action | Owner | Rationale | Done when |
|---|---|---|---|---|
| 1 | Verify acceptance criteria in the *running app*, by someone other than the story's author, before a card moves to done | All | The rich-field editors were "done" and unreachable for two weeks. A second pair of eyes in the actual UI is the only check that would have caught it | Sprint 3 Review lists no story that shipped broken and was previously marked complete |
| 2 | Review merges for content, not only commit messages — specifically check for colliding migration numbers | Merge owner | The duplicate `004` migration was invisible to the commit convention and would have been obvious to anyone reading the merge | No duplicate migration number reaches `main` in Sprint 3 |
| 3 | Complete US13's remaining half (pre-filling predictable fields on the new-entry form) | Ethan | The one item carried whole from Sprint 1 into Sprint 2 and still not fully done | Sprint 3 Review confirms it, or explains why it was dropped |
| 4 | Run a second, discoverability-focused user-feedback round: ask participants to *find* a named feature rather than only what they'd like added | Victor | Three Sprint 2 requests (dark mode, search, offline) were already built; the product's biggest gap is people not finding what exists, not missing features | Sprint 3's user feedback forms ask a find-this-feature question |
| 5 | Measure page load against a realistically sized logbook before optimising anything | Nkosinathi | Two respondents reported slowness with no specifics; guessing at a fix would burn sprint time with no way to confirm it worked | A load/latency measurement exists before any performance change is made |
| 6 | Write down the CI/CD knowledge that only Nkosinathi currently holds, so the Scrum Master role can actually rotate | Nkosinathi | Second sprint running the rotation planned in Sprint 1 didn't happen, for the same practical reason both times | CI/CD runbook exists in the docs site; a second person could run a deploy from it |
| 7 | Re-paste the docs-site Azure publish-profile secret and confirm the deploy job is green | Nkosinathi | Broke silently when a character was lost pasting it; stayed red until Sprint 3 | Docs deploy workflow green on a push to `main` |
| 8 | Rotate the Gemini API key that was committed to history | Nkosinathi | A credential once committed is compromised even after it's removed from the file | Old key revoked in Google AI Studio; new key only in Azure Application Settings and local `.env` |
| 9 | Remove unused frontend dependencies flagged during the sprint | Athalia | Housekeeping identified but not actioned in Sprint 2 | `package.json` has no dependency with zero imports |

---

## Looking back from Sprint 3

Recorded so this retrospective can be marked against what actually happened,
the same way the Sprint 1 Retrospective was.

- **Action 1 was adopted, and directly shaped how this sprint's own
  documentation pass was done** — the Sprint 3 accessibility and API-robustness
  work was repeatedly checked against the actual running app and the actual
  deployed API (Lighthouse against the live URL, `pytest` assertions against
  real request/response behaviour) rather than against intent. No story in
  Sprint 3 reached the same "done on the board, absent from the product" state
  Sprint 2 hit with the rich fields.
- **Action 2**: no duplicate migration numbers reached `main` in Sprint 3 —
  migrations `010` through `013` were each reviewed and numbered
  sequentially, one per feature, with an explicit comment in each file noting
  it's additive-only.
- **Action 3 (US13 pre-fill)**: not confirmed complete or explicitly dropped
  during this documentation pass — carried forward again, this time with a
  named reason to track: it kept losing priority to stories with clearer
  Sprint 3 guidance-note weight (coverage, robustness, accessibility). If it's
  still not done by Sprint 4, it should be explicitly dropped with a reason
  rather than carried a third time.
- **Action 4 was done**, and it worked: the Sprint 3 New User form asked
  about existing features, and found the same pattern again — a dashboard,
  search, and notifications were all requested by someone who already had
  access to all three, once more pointing at discoverability over feature
  count. See [User Feedback — Sprint 3](user-feedback-sprint-3.md).
- **Action 5 was done, and found a real, independently-confirmed problem.**
  Load testing found a genuine throughput bottleneck at 50 concurrent
  requests (14–21 req/s, not the connection-pool defaults the code shipped
  with), fixed with worker and pool-size changes. A real user, unprompted,
  separately reported the related cold-start symptom in the Sprint 3 New
  User form — the clearest possible confirmation that this measurement work
  was worth doing before guessing at a fix.
- **Action 6**: not done. The CI/CD runbook was not written this sprint,
  and Nkosinathi's Sprint 2 meeting-minutes role (merge owner) continued
  into Sprint 3's meetings. Carried forward a second time, now flagged as
  overdue rather than merely planned.
- **Action 7 held** — the documentation site build was verified clean
  (`mkdocs build --strict`) multiple times during Sprint 3's documentation
  pass, with no repeat of the publish-profile failure.
- **Action 8**: not verified during this documentation pass — whether the
  Gemini key was actually rotated needs confirming directly in Azure
  Application Settings and Google AI Studio, since it isn't something that
  shows up in the codebase either way.
- **Action 9**: not verified during this documentation pass.

AI Declaration: The preceding document was generated with: Claude Code [Claude Sonnet 5]
