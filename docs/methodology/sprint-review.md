# Sprint 1 Review

This page documents the Sprint 1 review, including completed and incomplete user stories, story points, velocity, and task delegation.

## Summary

| Metric | Value |
|---|---|
| **Sprint** | 1 |
| **Dates** | 2026-08-04 to 2026-08-24 |
| **Total user stories** | 20 |
| **Completed** | 17 |
| **Incomplete** | 3 |
| **Completion rate** | 85% |
| **Total story points** | 76 |
| **Completed story points** | 63 |
| **Velocity** | 63 points |
| **Tier achieved** | Basic (base tier) |

The team completed 17 of 20 base-tier user stories, achieving the **base tier** requirements as defined in the COMS3011A project brief. The sprint ran from 4 August to 24 August 2026, with the sprint review and retrospective held on 24 August.

US6 (Password reset) was removed from the sprint deliverables entirely — the feature was completed during the sprint but the PO decided at the Meeting 5 review to remove all local password authentication in favour of Google OAuth only. The three incomplete stories (US12, US13, US18) are deferred to Sprint 2.

Work was delegated in three waves across six developers (Victor, Ronald, Ethan, Nkosinathi, Athalia, Tebogo), with Matthew serving as external Product Owner. The team tracked all work on a Gitea Projects Kanban board, with each user story as a board item containing acceptance criteria and a checklist of sub-tasks.

### Key decisions during the sprint

- **Meeting 5 (2026-08-24):** PO decided to remove all local password authentication in favour of Google OAuth only. US6 (Password reset) was removed from the sprint deliverables as the feature is no longer needed.
- **Meeting 5 (2026-08-24):** Team agreed to pursue Google Calendar API as the external API integration for the intermediate tier.
- **Meeting 3 (2026-08-17):** Azure subscription quota limit was hit; Nkosinathi created a new Azure account to unblock deployment.
- **Meeting 3 (2026-08-17):** Tebogo proposed MkDocs for the documentation site — adopted.
- **Meeting 4 (2026-08-20):** Team adopted "The Wordmark" colour palette with dynamic visual elements.

## Completed User Stories

17 of 20 base-tier user stories were completed:

| US | Title | Assignee | Points |
|---|---|---|---|
| US1 | Initialize Repository & Git Workflow | Victor | 3 |
| US2 | Define entry fields | Athalia | 3 |
| US3 | Log entry with user-defined fields | Athalia | 5 |
| US4 | Sign in (Google OAuth) | Ethan | 5 |
| US5 | Account deletion | Ronald | 3 |
| US7 | API skeleton | Victor | 3 |
| US8 | Documentation site | Tebogo | 3 |
| US9 | External API integration plan | Tebogo | 3 |
| US10 | Per-project entry format | Athalia | 5 |
| US11 | Per-project formats | Athalia | 3 |
| US14 | Create projects | Nkosinathi | 3 |
| US15 | Archive projects | Nkosinathi | 3 |
| US16 | Time tracking — log time | Victor | 5 |
| US17 | Time tracking — accumulated totals | Victor | 3 |
| US19 | Timeline view | Ronald | 5 |
| US20 | Search entries | Athalia | 3 |
| US24 | Task tracking (with checklists) | Tebogo | 5 |

**Total: 17 completed, 63 story points.**

## Incomplete User Stories

3 stories were started but not completed during the sprint:

| US | Title | Assignee | Points | Reason |
|---|---|---|---|---|
| US12 | Quick capture (fast entry creation) | Ethan | 5 | Started in Wave 2 but blocked by the schema editor rework — the entry field definition changes in US10/US11 affected the quick capture implementation. The quick capture feature depends on the entry form's dynamic field rendering, which was being reworked mid-sprint. |
| US13 | Quick capture (pre-filled fields) | Ethan | 3 | Dependent on US12. Could not be started because the quick capture base was not completed. |
| US18 | Statistics | Nkosinathi | 5 | Started in Wave 3 but the statistics queries over JSONB entry data proved more complex than estimated. The flexible schema means statistics must aggregate across arbitrary user-defined fields, requiring dynamic SQL generation. |

**Total: 3 incomplete, 13 story points.**

### Notes on specific stories

- **US1 (Initialize Repository & Git Workflow):** Victor set up the Gitea repository, defined the branching strategy (GitHub Flow with feature branches), enabled branch protection on `main` (requires PR + review before merge), and created issue labels and milestones matching Sprints 1–3. The Gitea issue was opened by Athalia but the implementation work was done by Victor.
- **US4 (Sign in):** Originally scoped as password-based signup/sign-in. After the Meeting 5 PO decision, this was reworked to Google OAuth only. The original password auth was removed from both backend and frontend post-sprint.
- **US6 (Password reset):** Removed from the sprint deliverables. The feature was completed during the sprint but the PO decided at the Meeting 5 review to remove all local password authentication in favour of Google OAuth only. The story points are not counted.
- **US9 (External API integration plan):** Document-only story. The plan identified Google Calendar API as the target integration, which was subsequently confirmed at the Meeting 5 PO review.
- **US24 (Task tracking):** Implemented with checklists as a single story, covering both task CRUD and the per-task checklist with progress bar.

## Task Delegation Waves

Work was delegated in three waves, each building on the previous:

### Wave 1 — Foundation

| Assignee | User Story | Scope |
|---|---|---|
| Victor | US1 | Repository setup, branching strategy, branch protection, issue labels and milestones |
| Victor | US7 | API skeleton (FastAPI, routers, database setup) |
| Ethan | US4 | Authentication (Google OAuth sign-in) |
| Athalia | US10 | Define entry fields (schema editor) |
| Nkosinathi | US14 | Create projects (project CRUD) |

### Wave 2 — Core Features

| Assignee | User Story | Scope |
|---|---|---|
| Ronald | US5 | Account deletion |
| Ethan | US12 + US13 | Quick capture (fast entry creation and pre-filled fields) — **not completed** |
| Athalia | US11 | Per-project entry formats |
| Nkosinathi | US15 | Archive projects |
| Tebogo | US8 | Documentation site (MkDocs) |

### Wave 3 — Advanced Features

| Assignee | User Story | Scope |
|---|---|---|
| Victor | US16 + US17 | Time tracking (per-entry log and accumulated totals) |
| Ronald | US19 | Timeline view |
| Athalia | US2 + US3 + US20 | Entry field definition, entry logging, and search entries |
| Nkosinathi | US18 | Statistics dashboard — **not completed** |
| Tebogo | US9 + US24 | External API integration plan and task tracking (with checklists) |

## Retrospective Actions

| Action | Owner | Status |
|---|---|---|
| Adopt WIP limit of 2 items per member | All | Implemented |
| Replace scheduled standups with informal WhatsApp chat | All | Implemented |
| Remove password auth — Google OAuth only | Ronald, Ethan | Completed post-sprint |
| Complete US12, US13, US18 (deferred from Sprint 1) | Ethan, Nkosinathi | Sprint 2 priority |
| Polish light mode | Ethan, Victor | In progress |
| Pursue Google Calendar API as external integration | TBD | Sprint 2 |
| Ensure commit convention consistency | All | Ongoing |
| Rotate Scrum Master role for Sprint 2 | Nkosinathi → next | Planned |

## Sprint 2 Planning

Based on Sprint 1 velocity (63 points), Sprint 2 capacity is planned at approximately 63 story points, adjusted for:

- Carry-over work from Sprint 1 (US12, US13, US18 — 13 points)
- CGV project overlap (reduced capacity in second half of semester)
- Known absences
- Bug fixes and polish from Sprint 1 feedback
- Milestone 1 review feedback

Sprint 2 priorities:

1. **Complete deferred stories** — US12 (quick capture), US13 (quick capture pre-fill), US18 (statistics)
2. Polish light mode and responsive design for production readiness
3. Begin Google Calendar API implementation (based on the US9 plan document)
4. Start intermediate-tier features
5. Address any feedback from the Milestone 1 review

AI Declaration: The preceding document was reviewed and edited with: Qoder
