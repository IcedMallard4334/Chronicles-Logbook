# User Feedback — Sprint 2

Evidence of how user feedback was collected, what it said, what changed because
of it, and what was deliberately not changed.

---

## How it was collected

| | |
|---|---|
| **Method** | Google Form, distributed to students |
| **Date** | 14 September 2026 |
| **Responses** | 12 |
| **Questions** | 20 — a mix of 1–5 scales, multiple choice and free text |
| **Participants** | All 12 were first-time users of Chronicles. 10 had never used a digital logbook or project management tool before; 2 had. |

Participants were asked to use the app themselves and then answer, rather than
being walked through it. The free-text questions were deliberately split into
"what worked", "what did not" and "what would you add", so that praise and
criticism each had somewhere to go and neither crowded the other out.

### Limitations of this round

Recorded because they affect how much weight each finding can carry:

- **n = 12 and all first-time users.** Good for first-run experience, useless
  for anything that only shows up after weeks of real use — which, for a
  logbook, is most of its value.
- **Self-reported, not observed.** Nobody watched a screen. A participant who
  says a step was easy may still have taken five minutes over it.
- **Sampling bias.** Respondents were students, largely peers, which tends to
  inflate scores. The distribution supports that: nine of twelve gave an
  overall score of 3 or better.
- **One severe outlier.** One respondent scored every scale question 1. Their
  free text ("Not much impressed", "Slow", "Simplicity") is recorded and taken
  seriously below, but a single uniform-1 response cannot be separated from a
  protest vote, so it is not treated as representative on its own.

---

## The numbers

Mean of the 1–5 scale questions across all 12 responses:

| Question | Mean |
|---|---|
| Navigating the app | **4.2** |
| Creating your first schema | **3.9** |
| Overall ease of use | **3.9** |
| Adding an entry with the form you built | **3.8** |
| General comfort with new software | **3.8** |
| Understanding of this kind of tool | **3.3** |

Navigation scoring highest and self-rated *understanding* lowest matters: people
could move around the app more easily than they could explain what it was for.
That pattern points at concepts, not layout — which is exactly what the
free-text answers say.

### The clearest signal

> **Did you understand what "Entries" and "Tasks" were each for, without needing to ask?**

| Answer | Count |
|---|---|
| Yes, immediately clear | 5 |
| Eventually figured it out | 4 |
| Never fully clear | 2 |
| Didn't notice the difference | 1 |

**Seven of twelve (58%) did not find the distinction immediately clear.** No
other question in the survey produced a majority-negative result. This is the
headline finding.

### Sign-in

Two of twelve reported a problem signing in or signing up. Neither described
what went wrong in free text, so there is nothing specific to fix from this
round — but it is recorded, because 17% is not a rounding error and the next
round should ask a follow-up question when this is answered "Yes".

---

## What changed because of this feedback

### 1. Entries and Tasks now explain themselves against each other

**Finding:** 58% could not tell the two apart.

**Diagnosis.** The two page descriptions each described themselves and never
mentioned the other:

- Entries — *"A searchable record of progress, decisions and context."*
- Tasks — *"Clear next actions for the work that matters."*

Both are accurate and neither draws the line. Worse, the concepts genuinely do
overlap in the product: an **entry can itself be flagged "to do" with a due
date**, which is very close to what a task is. A user who noticed that had no
way to resolve it, which is likely what "didn't notice the difference" means.

**Change.** Each page now defines itself by contrast and names the other:

- Entries — *"A record of work you have already done. For something you still need to do, use Tasks."*
- Tasks — *"What still needs doing on a project. For recording work already finished, use Entries."*

**Why this and not a redesign.** The cheapest change that could fix a naming
problem is naming. Merging the two concepts, or removing the `todo` flag from
entries, would be a large change to the data model late in a sprint, and the
survey does not say the *features* are wrong — only that the words did not
separate them. If the next round still shows confusion, the overlap itself is
the thing to revisit, and that finding is recorded below.

### 2. Colours now follow the chosen theme everywhere

**Finding:** *"consistent colours that match the brand"* and *"the design could be more modern"*.

This corroborated a defect found independently during code review: highlight
styling asked for CSS variables (`--accent`, `--accent-light`) that were never
defined, and primary buttons, the selected calendar day and the active tab all
carried a hard-coded purple gradient. Whatever accent a user picked, large parts
of the interface ignored it. Those now read from the palette, so the accent
applies consistently.

**Why it matters:** a user cannot articulate "an undefined custom property is
falling back"; they say the design looks inconsistent. The survey turned a
vague aesthetic complaint into confirmation of a specific, fixable bug.

### 3. Search is reachable without knowing a keyboard shortcut

**Finding:** *"Search functionality"* was requested, and *"I had to look around to find certain options"*.

A command palette already existed, searching pages, commands and projects — but
the only way to open it was <kbd>Ctrl</kbd>+<kbd>K</kbd>, which nothing told the
user about. The account menu's "Search" item was also wired to the wrong place
by a copy-paste error, so it navigated to the profile page. Search now opens the
palette, and the menu shows the shortcut.

---

## Features that were requested but already exist

The single most useful thing this survey revealed is not a missing feature.
**Three of the features one respondent asked for were already built:**

| Requested | Status |
|---|---|
| Dark mode | Already implemented — light, dark and system, with four accents |
| Search | Already implemented — command palette over pages, commands and projects |
| Offline access | Already implemented — offline capture with a sync queue (US-2.16) |

A user asking for something that is already there is a **discoverability
failure, not a feature gap**, and the fix is the opposite of building more:
surface what exists. This reframed part of the response — item 3 above makes
search findable rather than adding a second search — and it is the main thing
the next round should test for, by asking participants to *find* a named
feature rather than asking what they would like added.

---

## What was deliberately not changed

Recorded with reasons, because deciding not to build something is a decision
like any other.

### Push notifications and reminders

*Requested by two respondents — "push notifications for important updates" and "a reminder section that gives a notification a bit earlier".*

**Not implemented.** Web push is not a feature, it is a subsystem: a service
worker, a push service subscription, permission prompting, and a server-side
scheduler to decide when to fire. That is disproportionate to a sprint that is
closing, and the risk is that a half-built version is worse than none —
notifications that fire late, twice, or not at all damage trust in the record
itself.

The underlying need — *"so I don't forget the main task at hand"* — is partly
met already: tasks and entries carry due dates and there is an Outstanding view.
A reminder system is recorded as a candidate for Sprint 3, where it can be built
with its scheduling properly designed.

### Tutorial videos

*Requested by one respondent — "videos".*

**Not implemented.** A video explaining an interface is a workaround for an
interface that needs explaining. The same respondent rated everything 4–5 and
said they would change "nothing", so this reads as a general nice-to-have rather
than a response to a specific difficulty. The effort is better spent making the
thing clear, which is what change 1 above does.

### "More components"

*Requested by one respondent.*

**Not implemented — not actionable.** The response does not say which components
or what they would do. Guessing at it would risk building something nobody asked
for while claiming it came from user feedback. The right response is a follow-up
question, and the next form will ask free-text feature requests to name a task
the user was trying to complete.

### Rebuilding the home screen

*Requested by one respondent — "less clutter on the home screen", "some screens feel a bit crowded".*

**Not implemented this sprint.** This is fair and probably right, but it is a
layout redesign, and one respondent's "crowded" is another's "everything in one
place" — two other respondents specifically praised the dashboard and the
sectioned layout. Acting on a single voice against two would be responding to
the loudest feedback rather than the strongest. It needs either more responses
or an observed session showing someone failing to find something.

---

## Recorded but not yet acted on

### Reports of slowness

Two respondents mentioned speed — *"Slow"*, and *"At times it took a bit long to
load"*. Neither says which screen or what they were doing, and one of the two is
the uniform-1 outlier.

**This is not dismissed, but it is not guessed at either.** Two of twelve is
enough to take seriously and too little to fix blind. Optimising a screen chosen
by intuition would burn sprint time with no way to tell whether it worked. The
correct next step is measurement — timing the main screens against a realistically
sized logbook — and that is scheduled rather than done, because the honest
version of this fix starts with a number.

### The Entries / Tasks overlap itself

Change 1 fixes the *wording*. It does not resolve that an entry flagged "to do"
with a due date is conceptually very close to a task. If the next round of
feedback still shows confusion after the copy change, the conclusion is that the
model — not the labels — is the problem, and the options are to merge the two or
to remove the `todo` flag from entries. Written down now so that the next round
can test the right thing.

---

## What this round says about the product

1. **People can use it; they are less sure what it is.** Navigation scored
   highest (4.2) and self-rated understanding lowest (3.3). The gap is
   conceptual, and concept problems are fixed with words before layout.
2. **The one majority-negative result has one cause and one cheap fix**, which
   has been made.
3. **Some of what was asked for already exists**, which makes discoverability —
   not feature count — the most valuable thing to work on next.
4. **Two respondents raised speed, and nobody can currently say whether they are
   right**, because the app has never been measured. That is the clearest
   process gap this round exposed.

AI Declaration: The preceding document was generated with: Claude Code [Claude Opus 5]
