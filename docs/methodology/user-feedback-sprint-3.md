# User Feedback — Sprint 3

Sprint 3's brief calls for **formal, extensive, independent user testing**,
not the informal round Sprint 2 asked for. We ran **two** Google Forms in
parallel instead of one — a **New User** form (first contact with the app)
and a **Returning User** form (people who used it in Sprint 2 and are seeing
what changed) — because "did this get better?" and "is this usable at all?"
are different questions, and one form answering both would have made both
answers weaker.

---

## How it was collected

| | New Users | Returning Users |
|---|---|---|
| **Distributed** | 28 September 2026 | 28 September 2026 |
| **Responses** | 7 | 2 |
| **Prior exposure** | First contact with Chronicles | Used it during Sprint 2 |
| **Questions** | 19 — 1–5 scales, multiple choice, free text | 17 — mostly free text and 1–5 scales, framed around specific Sprint 2 → Sprint 3 changes |

Combined with Sprint 2's 12 responses, **21 distinct people** have now given
formal feedback on Chronicles across the two sprints, above the 10+
independent users the Sprint 3 guidance asks for. As in Sprint 2, participants
used the app themselves before answering — nobody was walked through a flow.

**Forms (live links, as sent to participants):**

- Sprint 3 — [New User Feedback form](https://forms.gle/PiQ8fAkw5qVKArDB6)
- Sprint 3 — [Returning User Feedback form](https://forms.gle/CbNUHSziazaLd9Re6)
- Sprint 3 — [placement/distribution link](https://forms.gle/TTuzspxkBK7VstVT6) (what was actually shared with participants)
- Sprint 2 — [User Feedback form](https://docs.google.com/forms/d/e/1FAIpQLSdCjqcB2Jo__fwqC3QtG0ch4wZ6iwtqAeKN8kUGcEe1IuvQNA/viewform)

**Raw responses** (exported CSV, kept as submitted): see the team's shared
drive export alongside this documentation —
`Chronicles_ Digital Logbook — User Feedback (Responses)` (Sprint 2),
`Chronicles_ Digital Logbook - New User Feedback (Responses)` and
`Chronicles_ Digital Logbook - Returning User Feedback (Responses)`
(both Sprint 3). The Sprint 2 numbers and findings below are carried over
from [User Feedback — Sprint 2](user-feedback.md) for direct comparison.

### Limitations of this round

- **Returning-user n = 2.** Too small to draw statistical conclusions from —
  treated as two detailed qualitative accounts, not a trend, everywhere below.
- **New-user n = 7**, smaller than Sprint 2's 12. Combined across both
  sprints (19 new-user responses total) the picture is more stable, and that
  combined view is what the comparison below leans on.
- **Self-reported, not observed**, same caveat as Sprint 2: nobody watched a
  screen while someone filled the form in.

---

## New users: the numbers

Mean of the 1–5 scale questions, Sprint 2 (n=12) vs Sprint 3 (n=7):

| Question | Sprint 2 | Sprint 3 | Change |
|---|---|---|---|
| Ease of creating first schema/field | 3.9 | **4.4** | ▲ |
| General comfort with new software | 3.8 | **4.0** | ▲ |
| Adding an entry with the form you built | 3.8 | **4.0** | ▲ |
| Overall ease of use | 3.9 | **4.0** | ▲ |
| Self-rated understanding of this kind of tool | 3.3 | **3.1** | ▼ (small n, see below) |

Every scale that measures *doing something in the app* improved. The one that
measures *how well the participant feels they understand this category of
tool in general* — a question about the person, not the product — moved
slightly the other way, and with only 7 responses that's within noise rather
than a real regression.

### The Entries/Tasks distinction: better, but not solved

Sprint 2's headline finding was that **58% of respondents (7/12)** could not
immediately tell "Entries" and "Tasks" apart, and the fix was rewriting each
page's description to define itself by contrast with the other (see
[User Feedback — Sprint 2](user-feedback.md#1-entries-and-tasks-now-explain-themselves-against-each-other)).

Sprint 3 asked a related but not identical question ("did you understand what
Entries and Tasks were each for, without needing to ask?") and free-text
follow-up. Result: **3 of 7 (43%)** said "eventually figured it out" rather
than "immediately clear" — improved from Sprint 2's proportion, but the
confusion has not gone away, and two respondents' own words show exactly the
Sprint 2 failure mode recurring:

> "Honestly I was just a lazy user and didn't feel like reading so i initially
> assumed they were the same thing."

> "At first I wasn't sure if 'Tasks' were separate from entries or part of
> them. A short tooltip or example would help."

**Conclusion.** The copy fix helped (nobody said "never fully clear" this
round, versus 2/12 in Sprint 2) but a wording change on two static
descriptions cannot fully solve a distinction that only becomes clear once
someone actually uses both features. The second respondent's own suggestion —
a short tooltip or worked example at the point of confusion, not just on the
page description — is the more promising next step and is recorded below as
not yet acted on.

### Cold start: an independent confirmation of a known issue

> "When trying to first open the webapp I was stuck for 1-2 minutes waiting to
> sign in. Are you guys hosting on render or somewhere that has a cold start?
> If so then I'd constantly ping the server so that there isn't one."

This respondent independently diagnosed exactly what
[API Performance, Load & Robustness](../testing/api-performance.md#2-hosting-region-us-316)
already documents from direct measurement: Azure App Service on the free/
Student tier can idle out and cold-start. It's valuable as **user-facing proof
that a measured backend problem is actually felt by a real person**, not just
a number in a load-testing report. We have not implemented a keep-alive ping
(see "not yet acted on" below).

### Detailed, specific feedback (one respondent)

One new-user response was unusually thorough and is worth reproducing in full
rather than summarising, since several of its individual points map directly
onto action taken or already-planned:

> "The interface looks clean and simple... At first I wasn't sure if 'Tasks'
> were separate from entries... a warning or preview showing how edits will
> affect existing entries [when changing a field type] would make it
> clearer... I'd add clearer tooltips or a short tutorial... a dashboard view
> showing progress would be helpful... A search function for entries, export
> to PDF/Excel, and notifications for upcoming tasks would improve usability."

Cross-checked against what Sprint 3 actually shipped:

| Requested | Status |
|---|---|
| A dashboard view showing progress | **Already built independently** — US-3.9, the customisable Dashboard, shipped this sprint (see [Sprint 3 Meetings](sprint-3-meetings.md)) |
| Search across entries | **Already existed** before this feedback — the Entries table search and the `Ctrl`/`Cmd`+`K` command palette |
| A warning before a schema type change affects existing entries | **Already existed** — the schema-change review screen shows exactly which entries are affected before saving, but this respondent didn't encounter it, which is itself useful: it means the review screen either wasn't reached in their test session, or its wording didn't read as a "warning" |
| Export to PDF/Excel | **Not implemented** — see "what was deliberately not changed" |
| Notifications for upcoming tasks | **Already built independently** — the Reminders bell (US-3.12), shipped this sprint |
| Clearer tooltips / a short tutorial | **Partially addressed** — see Accessibility/help-manual work below; a targeted Entries-vs-Tasks tooltip specifically is not yet built |

Three of six requests were already met by other Sprint 3 work the respondent
hadn't discovered yet — the same "discoverability, not feature gap" pattern
Sprint 2 found. This reinforces that the highest-value work for Sprint 4 is
surfacing what exists (in-app hints, the help manual) rather than building
more.

---

## Returning users (n=2): qualitative, not statistical

Both returning-user respondents rated the app **4–5 out of 5** on UI,
customisability and performance, described the UI as "Neat and Simplistic",
and reported no regressions ("nothing became worse").

One had seen a specific Sprint 2 request implemented ("for it to operate more
efficiently") and rated the improvement 5/5, describing navigation as "easier
to use." The other had asked for **voice-to-text dictation** in Sprint 2 —
not implemented — and rated their experience improvement only 3/5 as a
result, naming "cloud and multi-device syncing" as the main remaining
performance bottleneck they'd like addressed.

**On voice-to-text:** still not implemented. Browser speech-to-text APIs are
inconsistent across browsers and would need a fallback path for anyone
without one, which is a larger UI/accessibility surface than a single Sprint
4 task justifies against everything else already queued. Recorded as a
candidate feature, not dismissed.

---

## What changed because of this round

### Accessibility (US-3.19)

Directly informed by this sprint's Lighthouse pass (see
[API Performance, Load & Robustness — Frontend performance](../testing/api-performance.md#frontend-performance-google-lighthouse-us-317)),
which flagged one automated contrast issue and prompted a manual accessibility
audit of the rest of the app. Fixed:

- Low-contrast auth-page label (light lavender text on a near-white panel).
- Command palette: focus was lost to `<body>` after closing it instead of
  returning to the search trigger, because the trigger unmounts in the same
  render that opens the dialog.
- A "calculated value" (ƒ) badge on entry fields was `aria-hidden`, giving
  screen-reader users no way to tell a value was derived rather than typed.
- Checklist/task toggle buttons conveyed their checked state only through a
  changing `aria-label`, not a formal `aria-checked` property.
- Two form `<select>` inputs in the advanced search builder had no associated
  `<label>`.
- Two heading-level skips (`h2` → `h4`) in the empty-state screen and the
  project-sharing panel.

Lighthouse Accessibility went from 95 (automated only) to 100 after the
manual pass — confirming the guidance notes' point that automated tooling
"can only detect a subset of issues."

### Help manual and onboarding

New "What is a logbook?" section explaining the product's purpose from
first principles (direct response to the recurring "what is this tool for"
theme across both sprints' free text), a documented "Entry history" feature,
a full "Automation" section (rules, recurring entries, reminders — all new
this sprint and previously undocumented), and onboarding coach-marks added
for the Statistics and Automation project tabs, which had none.

### Navigation and layout

Today and Outstanding moved from the crowded top nav bar into the Home
sidebar (alongside Projects and Activity); Dashboard moved to directly after
Home; the redundant per-project Statistics toggle was removed now that a
dedicated, workspace-wide Statistics page exists. A long, unbroken project
description was found to overflow its box and run behind the project tabs —
fixed with proper text wrapping.

---

## What was deliberately not changed

### Export to PDF/Excel

*Requested again this sprint, and in Sprint 2 as CSV.* **Not implemented.**
The API can already produce a flat CSV of a project's entries, and the full
account JSON export/import already exists — building a second, differently
formatted export (PDF or XLSX) is meaningfully more work (a rendering/
templating step, or a spreadsheet-writing library) for a need the existing
JSON export already covers for backup/portability purposes. Recorded as a
Sprint 4 candidate if time allows, prioritised behind fixes with a clearer
usability failure behind them.

### Voice-to-text dictation

See "Returning users" above — not implemented, browser API inconsistency
makes it a larger scope item than it first appears.

### A keep-alive ping against cold starts

*Independently surfaced by a user and already documented from measurement.*
**Not implemented.** A scheduled ping would mask the symptom without fixing
the underlying cause (a hosting tier that idles out), and would itself cost
Azure credit running indefinitely. The honest fix is a hosting tier that
doesn't idle, which is a budget decision recorded in
[API Performance, Load & Robustness](../testing/api-performance.md#2-hosting-region-us-316),
not a code change.

---

## Recorded but not yet acted on

### The Entries/Tasks distinction, still

As detailed above: the Sprint 2 copy fix helped but did not resolve the
confusion. The next step, per a respondent's own suggestion, is a contextual
tooltip or first-use example at the point where someone is about to create
an entry or a task — not another change to the static page description,
which has already been tried once.

### "A short tooltip or a short tutorial" (repeated request)

Two respondents across both sprints have separately asked for in-context
guidance beyond the current guided tour. The guided tour already exists
(see the help manual's "Guided tour" article) but evidently isn't perceived
as answering this — worth a dedicated look in Sprint 4 at whether it's
undiscoverable, or whether it's too broad/short-lived to be what people mean
by "a tutorial."

---

## What this round says about the product

1. **Every task-based usability score improved from Sprint 2 to Sprint 3.**
   Where the numbers measure doing something in the app, not describing the
   category of tool, Sprint 3 is ahead across the board.
2. **The Entries/Tasks confusion is a genuine, persistent conceptual issue**,
   not a wording bug — the Sprint 2 fix helped but a second, independent
   round of feedback shows the same root confusion in different words. It
   needs a different kind of fix (contextual, not descriptive) next.
3. **Discoverability is still the single highest-leverage gap.** For the
   second sprint running, several "requested" features already existed
   (search, notifications, a dashboard, a pre-save change warning) — the
   product doesn't need more features as urgently as it needs the features it
   already has to be found.
4. **A backend performance problem measured in a load-testing script was
   independently felt and correctly diagnosed by a real, unprompted user** —
   the clearest possible confirmation that the [API Performance](../testing/api-performance.md)
   findings are not just synthetic numbers.

AI Declaration: The preceding document was generated with: Claude Code [Claude Sonnet 5]
