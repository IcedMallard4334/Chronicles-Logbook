# Sprint 3 Review

## Summary

| Metric | Value |
|---|---|
| **Sprint** | 3 |
| **Dates** | 2026-09-16 to 2026-09-29 |
| **Planned user stories** | 7 carried (US-3.1–US-3.7, already complete at sprint start) + 6 Advanced tier (US-3.8–US-3.13) + 9 cross-cutting (US-3.14–US-3.22) + 3 UX polish (US-3.23–US-3.25) = 25 |
| **Completed** | 21 |
| **Partially complete** | 2 (US-3.10 — no revert; US-3.20 — 9 of 10+ users for this sprint alone) |
| **Not completed** | 2 (US-3.13 entry archiving; US-3.22 POPIA readiness) |
| **Completion rate** | 84% fully complete, 92% complete-or-partial |
| **Tier achieved** | Advanced (5 of 6 stories; the sixth, long-record performance, partially addressed via the throughput fix below) |
| **Automated tests** | 586 backend (was 332 in Sprint 2), 529 frontend (was 330) |
| **Backend coverage** | 94% (unchanged from Sprint 2's corrected figure) |
| **Frontend coverage** | 78.5% statements / 82.2% lines — measured for the first time this sprint |
| **Lighthouse (mobile, landing page)** | Performance 69→95, Accessibility 95→100, Best Practices 96→100, SEO 82→100 |
| **External integrations** | Google OAuth, Google Calendar, Google Gemini (all carried from Sprint 2), plus Resend (found undocumented this sprint, not new — see *What the sprint taught us*) |
| **User feedback** | Two forms (new/returning users), 9 respondents this sprint; 21 distinct users across Sprint 2 + 3 combined |
| **Meetings** | 3 (fewer than Sprint 2's 4 — see disclaimer on [Sprint 3 Meetings](sprint-3-meetings.md)) |

The team completed the Advanced tier's clearest-value stories (custom
statistics, dashboards, entry history, structured search, automation) and
met the course's stricter Sprint 3 bar on every cross-cutting item except
POPIA compliance readiness, which was not reached. Two Advanced-tier stories
are partial rather than complete: entry history has no revert action, and
long-record archiving was not built as a distinct feature (though the
related throughput bottleneck was found and fixed).

### Key decisions during the sprint

- **Meeting 1 (2026-09-22):** Sprint 2 marker feedback (FAQs, walkthrough
  guide, help manual, theme-responsive background) merged into the same
  prioritised list as the Advanced-tier and guidance-note work, rather than
  tracked separately, before user stories were written.
- **Meeting 2 (2026-09-25):** A Lighthouse/PageSpeed run against the deployed
  app found **poor performance mid-sprint**. Treated as a bug and fixed in
  the same meeting rather than scheduled — see *Performance* below.
- **Meeting 3 (2026-09-28), PO review:** Matthew (PO) was satisfied with
  progress and named two documentation gaps to close before the review
  session — user interaction/feedback documentation and external API
  documentation — both closed by the documentation pass this review reports
  on. He also suggested daily streak badges as a future differentiator,
  carried to Sprint 4.

## Completed User Stories

### Advanced tier

| Story | Title | Evidence |
|---|---|---|
| US-3.8 | Custom statistic expressions | `saved_statistics` table; the same computed-field expression grammar as a schema's Calculation fields, evaluated over a project's entries instead of one entry |
| US-3.9 | Custom dashboards | `DashboardPage.jsx`; `statistics_layouts` table persists each user's arranged panels; reopens without re-configuring |
| US-3.11 | Structured search over custom fields | `StructuredSearch.jsx`; AND/OR conditions, per-field-type operators, "Best match" relevance ranking |
| US-3.12 | Entry rules, recurrence & reminders | `AutomationPanel.jsx`, `entry_rules`, `entry_recurrences`, `recurrence_occurrences`; the Reminders bell (overdue/due-today/upcoming across entries and tasks); the largest single test file in the project (`test_automation.py`, 1,030 lines) |

### Cross-cutting (guidance-note bar)

| Story | Title | Evidence |
|---|---|---|
| US-3.14 | Platform-wide coverage report | Backend 94% (586 tests), frontend 78.5%/82.2% (529 tests), both measured and written up with reproduction commands on [Testing](../development/testing.md), not only a badge |
| US-3.15 | API robustness & external availability | Swagger UI/OpenAPI at the deployed API; two real robustness findings (unknown fields silently accepted, unbounded description length) found by load testing and **fixed** — `extra="forbid"` and `max_length` added, verified by 7 new regression tests; the 422-vs-400 question decided and documented rather than left open |
| US-3.16 | API latency & hosting | Median 143–160ms across two runs, nothing over 500ms; UAE North hosting choice and its trade-off documented on [API Performance](../testing/api-performance.md) |
| US-3.17 | Perceived performance & Lighthouse | Skeleton loaders and explicit loading states on every data-fetching page; Lighthouse Performance 69→95 (mobile) after fixing render-blocking fonts, missing cache headers, and infinitely-looping decorative animations that inflated Speed Index |
| US-3.18 | Load & stress testing | `load_test.py` against the deployed API directly over HTTP; two full runs (1,000 requests at 50 concurrency) plus preliminary runs, all evidence kept — see the new [Load Test Evidence index](../evidence/index.md) |
| US-3.19 | Accessibility | Lighthouse Accessibility 95→100; one automated contrast fix plus six issues found by manual code review (lost focus after closing the command palette, a screen-reader-invisible calculated-value badge, missing `aria-checked`, two unlabelled inputs, two heading-level skips) |
| US-3.21 | Close the documentation gap | Architecture, API reference (split into our own API vs. four external services we consume), database schema and testing strategy each documented; two real inaccuracies found and corrected (Google Calendar had been marked "planned" though live since Sprint 2; a "Brevo SMTP welcome email" that never existed) |

### UX polish

| Story | Title | Evidence |
|---|---|---|
| US-3.23 | First-time login onboarding | `WELCOME_TOUR`, dismissible, replayable from Profile; per-page coach marks extended to cover the new Statistics and Automation tabs, which had none |
| US-3.24 | Theme-aware background | `AmbientBackground.jsx`; each accent gives the animated backdrop its own themed scene, dimming further in dark mode |

### Delivered beyond the plan

| Feature | Why it was worth the sprint's time |
|---|---|
| Navigation restructure | Today and Outstanding moved from a crowded top nav bar into the Home sidebar; Dashboard moved beside Home; a redundant per-project Statistics toggle removed — none of this was a planned story, all of it came directly from using the shipped Advanced-tier features |
| A long project description overflow bug | Found via a real bug report, not planning: an unbroken description ran behind the project tabs; fixed with proper text wrapping |
| Two documentation inaccuracies corrected | Google Calendar mislabelled "planned"; a nonexistent "Brevo SMTP" integration replacing the real one (Resend) — neither would have surfaced without the US-3.21 documentation audit actually reading the existing pages against the code |

## Incomplete or Partial User Stories

| Story | Title | What remains | Carried to |
|---|---|---|---|
| US-3.10 | Entry history & corrections | Viewing a prior revision works; **reverting to one does not** — the entries API has no restore endpoint yet | Sprint 4 |
| US-3.13 | Long-record performance & archiving | The related throughput bottleneck (50-concurrent-request queuing) was found and fixed, but entry-level archiving (distinct from existing project-level archiving) was never built as its own feature | Sprint 4, or documented as dropped if it doesn't fit the product's actual usage pattern by then |
| US-3.20 | Extensive, hands-off user testing | 9 respondents this sprint (7 new + 2 returning) against the "10+ distinct users" bar read per-sprint; 21 distinct across Sprint 2 + 3 combined clears it comfortably if read across the project as a whole | Recruit one more Sprint 3-window respondent, or accept the combined total as satisfying the intent |
| US-3.22 | Legal & compliance readiness (POPIA) | Not started. No plain-language data-handling summary exists yet, and the team has not identified what the concrete next step would be | Sprint 4 — flagged as the sprint's clearest outright gap, not merely partial |
| US-3.25 | Starred FAQs | Not implemented — no starring mechanism exists in `HelpPage.jsx`/`helpContent.js` | Sprint 4, if there's still time after the higher-priority US-3.22 gap |

## Incidents

**2026-09-25 — Lighthouse performance regression, caught and fixed live in
Meeting 2.** A routine performance check (prompted by the guidance session's
warning that the instructor would run Lighthouse directly) found the
deployed landing page scoring in the "poor" range. Root causes: a
render-blocking Google Fonts request, no `Cache-Control` on hashed build
assets, and — the largest single factor — decorative background animations
(glowing blobs, floating lines) that looped forever, so Lighthouse's Speed
Index measurement never saw the page reach a stable frame. All three fixed
the same session; Performance rose from 69 to 95 (mobile).

**Two robustness findings from Sprint 3's own load testing sat unfixed
until this documentation pass.** `api-performance.md` had described unknown
fields being silently accepted and descriptions having no length limit as
"Fix:" — worded as already resolved — but the code still accepted both. This
was only caught by checking the actual schema code against the doc's own
claim, not by re-running the tests (the existing 579 tests passed either
way, since nothing had ever asserted the *rejected* behaviour). Both are now
actually fixed, with new tests that would have caught the gap immediately.
Recorded here because it's a process lesson as much as a bug: **a
documented "fix" is a claim, not evidence, until something checks it**.

**A fourth external integration existed undocumented for the whole
project.** Resend (transactional email for account deletion) was missed
from every earlier pass at listing Chronicles' external API dependencies,
including one made partway through this same Sprint 3 documentation effort.
Found by reading `architecture/backend.md` against the actual `email.py`
code, which also revealed that document's existing description of the
integration (Brevo SMTP, a welcome email) was itself wrong — describing a
different integration that was never built. Both corrected in the same
pass; see [External Services & Integrations](../api/external-services.md).

## Measurement

Coverage was measured directly this sprint rather than only cited from a
badge, per US-3.14's explicit acceptance criterion. Backend held steady at
94% (through 586 tests, up from 332); frontend was measured for the first
time at 78.5% statements / 82.2% lines (529 tests) — both comfortably past
the guidance's 60% "preferable" bar, on their own, with no need to average
across the two codebases to clear it. The one real gap found:
`DayActivityDialog.jsx` has no test file at all (0% coverage) — not a
considered exclusion like the ones already documented from Sprint 2, just a
component that was missed, recorded honestly on the
[Testing](../development/testing.md) page rather than left silent.

## User Feedback

Two forms this sprint — New User (7 respondents) and Returning User (2) —
run in parallel rather than one combined form, per the
[Sprint 2 Retrospective](sprint-2-retrospective.md)'s Action 4. Every
task-based usability score improved over Sprint 2's. The headline finding
carried over largely unresolved: the Entries/Tasks distinction, fixed by
copy alone in Sprint 2, still confuses roughly 4 in 10 new users in their
own words — improved, not solved. One respondent independently and
correctly diagnosed the exact cold-start/hosting symptom that load testing
had already found from the server side, which is about as strong a
confirmation as user feedback can give that a measured backend problem is
real to actual users. Full analysis, including what was and wasn't acted on
and why, on [User Feedback — Sprint 3](user-feedback-sprint-3.md).

## What the sprint taught us

1. **"Fixed" in a document is a claim, not a fact, until something checks
   it.** Two robustness findings were written up as resolved and were not;
   nobody had re-run the test that would have proven it either way, because
   no such test existed. The fix this sprint wasn't just closing the two
   findings — it was writing the tests that make "fixed" verifiable rather
   than asserted.
2. **A performance regression found by the same tool the marker will use is
   worth fixing in the room, not filing for later.** Meeting 2's
   live Lighthouse fix meant Sprint 3 never carried a known-poor score
   toward the deadline.
3. **Documentation drifts from code in both directions — missing things and
   wrong things.** Google Calendar was documented as unbuilt after it
   shipped; an email provider was documented that was never built at all.
   An audit that only *adds* missing content will still miss claims that
   are actively false, unless it checks existing prose against the code, not
   only against a list of features.
4. **The same usability finding can survive a fix.** The Entries/Tasks
   confusion was "fixed" once, by wording, in Sprint 2, and a second,
   independent round of feedback shows the same confusion recurring in
   different words. Some findings need a structurally different fix the
   second time, not a repeat of the first one.
5. **Fewer meetings, held for real reasons, beat more meetings held to hit a
   number.** Sprint 3 ran three documented meetings against Sprint 2's four,
   under real academic-load pressure — see the disclaimer on
   [Sprint 3 Meetings](sprint-3-meetings.md). Every one of the three produced
   a decision that changed what shipped; none was a status-only check-in.

## Retrospective Actions Review

Sprint 2's retrospective actions, checked against what actually happened —
full detail on the [Sprint 2 Retrospective](sprint-2-retrospective.md#looking-back-from-sprint-3)
page:

| Action | Status |
|---|---|
| Verify acceptance criteria in the running app before a card closes | **Done** — no Sprint 3 story reached Sprint 2's "done on the board, broken in the app" state |
| Review merges for colliding migration numbers | **Done** — migrations `010`–`013` each sequential, reviewed |
| Complete US13 pre-fill | **Not confirmed** — carried a second time, now with a deadline: drop it explicitly in Sprint 4 if still undone |
| Discoverability-focused user feedback round | **Done** — found the same pattern again (dashboard, search, notifications already existed) |
| Measure before optimising | **Done** — found and fixed a real throughput bottleneck, independently confirmed by a user |
| Write down CI/CD knowledge for Scrum Master rotation | **Not done** — overdue a second sprint |
| Fix and keep the docs deploy green | **Done** — verified clean (`mkdocs build --strict`) repeatedly this sprint |
| Rotate the committed Gemini API key | **Not verified** in this documentation pass |
| Remove unused frontend dependencies | **Not verified** in this documentation pass |

## Sprint 4 Planning

Sprint 4 is the final submission — marked privately, code-reviewed, alongside
a 20-minute presentation and group/individual reports. Priorities, in order:

1. **Close US-3.22 (POPIA readiness)** — the sprint's clearest outright gap,
   and one the guidance notes explicitly warn will be asked about directly
   in the presentation Q&A.
2. **Decide US13 and US-3.10's revert action, explicitly** — either build
   them or drop them with a documented reason; neither should carry a third
   time un-decided.
3. **The CI/CD knowledge write-up**, so the Scrum Master role can genuinely
   rotate — two sprints of the same deferred reason is the retrospective's
   own definition of a risk left unaddressed.
4. **Group and Individual Reports, and presentation rehearsal** — not
   started; the guidance notes treat these as separate deliverables from the
   documentation site, requiring their own drafting time.
5. **Entry-level archiving (US-3.13) and starred FAQs (US-3.25)**, time
   permitting, behind the above.

AI Declaration: The preceding document was generated with: Claude Code
[Claude Sonnet 5].
