# Sprint 1 Retrospective

| | |
|---|---|
| **Sprint** | 1 — 2026-08-04 to 2026-08-24 |
| **Held** | 2026-08-24, MSL006, directly after the PO review (Meeting 5), team only |
| **Revisited** | 2026-08-26 at Sprint 2 Meeting 1, once the Milestone 1 marking feedback had arrived |
| **Format** | What went well / what did not / what we change |

A retrospective is only useful if it changes the next sprint, so every item
below ends in an action, and every action names who owns it and how we would
know it happened. Where the marking feedback contradicted the team's own view
of the sprint, the feedback wins and that is recorded — the point of the
exercise is to find what we could not see from the inside.

---

## What went well

**Base tier delivered.** 17 of 20 stories and 63 of 76 points, and the three
stories that slipped (US12, US13, US18) were a coherent group — quick capture
and statistics — rather than a scattering of half-done work. The PO's demo at
Meeting 5 covered project creation, schema definition, entry logging, time
tracking, tasks with checklists, search and the timeline end to end.

**The board was real.** Every story lived on the Gitea Kanban board with
acceptance criteria and a sub-task checklist, and the three delegation waves
(foundation → core → advanced) meant nobody was blocked waiting on a teammate's
unfinished foundation. This is the practice most worth keeping.

**Blockers were cleared in the sprint, not carried.** The Azure quota limit at
Meeting 3 could have stalled deployment for a week; Nkosinathi opened a new
account the same day. MkDocs was proposed and adopted in the same meeting.
Decisions did not wait for the next scheduled discussion.

**The PO changed the product for the better.** Dropping password
authentication for Google-only (Meeting 5) removed a whole class of security
work — reset flows, hashing, token storage — and the feature it removed (US6)
had already been built, which is a cost we accepted rather than sunk-cost
arguing for. Choosing Google Calendar as the integration gave the intermediate
tier a direction with real student value.

---

## What did not go well

**Scheduled standups did not survive contact with six timetables.** Attendance
fell off and the standup became a thing people apologised for missing. The
information still flowed — over WhatsApp — so the ceremony was adding guilt
without adding communication.

**Too much in progress at once.** Members were routinely carrying three or
four items, which showed up as context-switching, half-finished branches, and
the three deferred stories all belonging to people with the widest spread.

**Commit messages drifted.** The Conventional Commits standard was documented
and then unevenly followed, which the PO noticed at Meeting 5 before we did.

**We could not see our own gaps.** The Milestone 1 marking feedback, reviewed
at Sprint 2 Meeting 1, named six things the team had not flagged in its own
retrospective:

| Marking feedback | Why we missed it |
|---|---|
| Testing and debugging effort was invisible on the tracker | It was happening, but inside feature stories, so it did not show as work |
| No motivation for *why* agile | We had written why we rejected the alternatives, and mistook that for the same thing |
| Documentation site colour scheme unprofessional | Nobody on the team had looked at the docs site as a reader would |
| Schema fields could not be edited once created | Add and remove worked, so the story felt done; a real user's first instinct — fixing a typo — was never tried |
| Live documentation deployment stale or unreachable | It deployed once and was assumed to keep working |
| "Motivations for everything" | Decisions were recorded as *what* without *why*, which reads as arbitrary to anyone who was not in the room |

The common thread is that every one of these is a difference between *doing*
the work and *evidencing* it. That distinction became the theme of Sprint 2.

---

## What we change

| # | Action | Owner | Rationale | Done when |
|---|---|---|---|---|
| 1 | Replace scheduled standups with the WhatsApp channel, with one rule: post what you are on and what is blocking you when you start work | All | The ceremony was failing; the channel was already working. Formalising the working thing beats rescuing the failing one | Sprint 2 Meeting 1 confirms nobody missed a "standup" |
| 2 | WIP limit of 2 items per member | All | The deferred stories belonged to the most spread-out members. Fewer items in flight means each one finishes | Board shows no member with more than 2 in progress |
| 3 | Complete US12, US13, US18 as Sprint 2's first priority | Ethan, Nkosinathi | They are the base tier's unfinished edge; the intermediate tier should not be built on a gap | Sprint 2 Review lists them complete |
| 4 | Rotate Scrum Master | Nkosinathi → next member | A rotating role spreads the process knowledge and stops one person becoming the only one who can run a meeting | Sprint 2 meetings chaired by the new SM |
| 5 | Add a "Testing & Debugging" column to the tracker | Nkosinathi | Makes the invisible work visible, as the marking asked | Column exists and has cards |
| 6 | Write the "why agile" motivation, and add a *why* to every recorded decision from here on | Tebogo (methodology page); all (meeting minutes) | Motivations were the most sweeping marking point. This is why every decision table in the Sprint 2 minutes carries a Rationale column | Methodology page has a Motivation section; no Sprint 2 decision lacks a rationale |
| 7 | Adopt the app's indigo palette on the docs site | Tebogo | The docs site is a deliverable people read; it should look like it belongs to the product | `mkdocs.yml` palette matches the brand |
| 8 | Schema field editing becomes US-2.6, a first-class Sprint 2 story | Victor | Flagged by both the marking and the PO; it is the difference between a schema you can set and one you can live with | US-2.6 complete with a preview-before-apply flow |
| 9 | Fix the docs deployment and check it after every docs change | Nkosinathi | A deploy that ran once is not a deployment | Docs URL reachable without an account; deploy job green on every push |
| 10 | Enforce Conventional Commits | All | The PO caught this before we did | No non-conforming commit on `main` after 2026-08-26 |

---

## Looking back from Sprint 2

Recorded so the retrospective can be marked against what actually happened:

- Actions 1, 2, 5, 6, 7 were **done** and held for the whole of Sprint 2.
- Action 4 was **not done**: Nkosinathi continued as Scrum Master through
  Sprint 2 — the Sprint 2 Meeting 3 minutes assign him merge ownership in that
  role. The reason was practical: he also owned CI/CD and the Gitea pipeline,
  and Sprint 2's integration problems (six unmerged branches at Meeting 3)
  needed the person who understood the build. That is a fair reason to defer
  the rotation and a poor reason never to do it; it is carried to Sprint 3
  with the CI knowledge to be written down first so the role *can* move.
- Action 3: US18 (statistics) was completed and grew into the format-aware
  statistics of US-2.10 and US-2.11. US12 and US13 (quick capture) are met by
  the command palette (`Ctrl`+`K`) and the sidebar's search, though the
  "predictable fields pre-filled" half of US13 remains only partly true and is
  carried to Sprint 3.
- Action 8 was **done**, and turned out to be the sprint's largest single piece
  of work once "edit a field" met "and the entries already written must not
  be corrupted" (US-2.6 through US-2.8).
- Action 9 was done and then **regressed**: the docs deploy job broke again in
  Sprint 2 when the Azure publish-profile secret was pasted with a character
  lost, and stayed red until the secret was replaced. The lesson added to the
  action: a green deploy is a state, not an achievement, and needs watching.
- Action 10 held, with one lapse — a merge in which two feature branches had
  each numbered a database migration `004`, which the commit convention could
  not have caught but a review of the merge would have. Reviewing merges,
  not only commits, is the carried-forward version of this action.

AI Declaration: The preceding document was generated with: Claude Code [Claude Opus 5]
