# Mira: actions, context and consent

Mira is the assistant in Chronicles. Beyond answering questions she can **do what
you can do by hand**: create projects, change schemas, add tasks, set reminders
and more. This page explains what she can do, what she can see, and the
safeguards around both. The endpoints are in [Mira (API)](../api/mira.md).

## What changed and why

Until 30 September 2026 Mira could only chat and propose a new project, one at a
time, and she had no idea what was in a person's logbook. That made "add a task to
my Bug Log project" impossible. Three things now let her act:

1. **A snapshot of the workspace**, so she can refer to real projects, tasks and
   entries.
2. **A list of 27 functions** she can call, covering the everyday things you do.
3. **Several actions in one reply**, so "set up a launch project with three tasks" is
   one request.

## What she can do

She calls *functions*; each is validated on the server against a closed list
(`backend/app/mira_tools.py`) before you ever see it. Nothing outside this list can
be proposed, and arguments that don't fit are refused rather than guessed at.

| Area | Functions |
|---|---|
| **Projects** | `create_project` (with fields and statuses), `update_project`, `set_statuses`, `archive_project` (or unarchive), `delete_project` |
| **Schemas** | `add_field`, `rename_field`, `remove_field` (recorded values are kept) |
| **Entries** | `create_entry`, `update_entry`, `delete_entry` |
| **Tasks** | `create_task`, `update_task`, `complete_task` (or reopen), `delete_task` |
| **Calendar** | `create_activity`, `update_activity`, `delete_activity` |
| **Reminders** | `set_reminder` (a due date and time on a task or entry), `set_recurrence`, `stop_recurrence` |
| **Automation and stats** | `create_rule`, `create_statistic` |
| **People** | `share_project` |
| **The app** | `open_page`, `set_theme`, `add_dashboard_panel` (projects, unlocked badges, a project's board or an overview statistic) |

Projects and fields are referred to by **name**, the way you'd say them. Existing
entries, tasks and activities are referred to by the **ids shown in her context**
(entries and tasks look like `project-id/item-id`). A project created earlier in the
same reply can be used by name in the next action.

Four functions are marked **destructive**: `delete_project`, `delete_entry`,
`delete_task`, `delete_activity`.

## What she can see

With each message, Chronicles builds a small snapshot (`backend/app/mira_context.py`)
and sends it to Google Gemini with your message. It contains **only**:

| Section | Detail | Cap |
|---|---|---|
| Today's date | Your local date | |
| Projects | id, name, archived flag, **field names and types** (dropdown options too), statuses | 30 |
| Open tasks | project/task id, project name, title, due date | 30 |
| Recent entries | project/entry id, project name, status, the **first 50 characters** of the title or first text value | 20 |
| Scheduled activities | id, day, time, title, for the next 14 days | 20 |

It never includes full entries, other field values, your Google Calendar, your
account details or other people's private projects. Projects shared *with* you
appear, since you can already see them. The snapshot is built only for people who
have **accepted the current Mira notice**; otherwise the workspace is not read at
all.

Text in the snapshot is something *you* wrote, so Mira is told to treat it as data
and never as instructions. That, plus the confirmation step below, is the defence
against a line in an entry trying to steer her.

## Consent

Mira's notice is versioned (`2026-09-30`). Because the snapshot and the ability to
act are a much bigger permission than chat alone, **everyone is asked again** the
first time they open the app after this version: a choice saved against the old
version no longer counts. The permission page lists exactly the snapshot above.
Declining keeps Chronicles fully usable with basic local guidance: nothing is sent
to Gemini and no proposals are generated.

## How she works: act, show, check

Mira is meant to feel like talking to Claude: say what you want and she does it,
and you can see what is happening.

1. **She acts straight away.** A request that only adds or edits runs as soon as she
   has written her reply. She says at most one short sentence and does not narrate.
2. **Every step is in the chat.** Under her reply is a card with one row per step, each
   with its own status: waiting, spinning, done (in the past tense: *Created project
   “Launch”*) or not working (with the reason, in red), and any that were not run.

   > **All done**
   > ✓ Created project “Launch”
   > ✓ Added the task “Write copy” to “Launch”, due 2026-10-05

3. **She is told how it went.** When a step fails, how every step went is sent back to
   her (as a turn of its own, kept in the conversation but not shown as a chat bubble).
   She then puts it right herself (a different name, a corrected value) or asks for
   *exactly* what is missing, in one short question. She answers her own failures at
   most twice in a row, so it can never loop.
4. **She can be stopped.** While she is replying, *Send* becomes *Stop*. What she has
   written stays, and nothing she proposed in a stopped reply is run.

**Deleting always asks.** A reply that contains any deletion waits for a click on its
card (*Mira needs your OK*, with *this can't be undone* on the step). Under the message
box, **Ask me before Mira changes anything** turns the same card on for every change
(it is off by default and remembered per browser).

Actions run **in order** through the same authenticated calls a manual edit makes, so
every ordinary permission and validation rule applies: she can't do anything you
couldn't. Each action resolves names against what exists *at that moment*, so a later
one can use something an earlier one created. A batch **stops at the first failure**,
because later steps may depend on it, and the steps after it are shown as not run. A
batch never throws: if your workspace cannot even be read, that is reported as a failed
step, not a crash.

### Entries and projects, in the project's own terms

- **She knows what is required.** The context lists each project's fields with their
  type, whether they are required or optional, the choices of a dropdown and the size
  of text (short up to 255 characters, long up to 5,000), and says that every entry has
  a title and a time of its own. A finished entry needs every required field; planned
  work (`todo`) needs none.
- **Title and time are the entry's own.** `title` and `time_spent_minutes` are never
  put in `values`. If she keys a value *Title*, *Hours* or *Minutes* anyway, it goes to
  the right place unless the project has a field of that name.
- **Refused in words you can read, before the server is asked.** A required field left
  empty (*“Garden” needs Place and Labels before this entry can be logged*), text over
  its limit, a date that is not `YYYY-MM-DD`, a dropdown value that is not a choice
  (case is forgiven) and a number that is not one each give a plain sentence naming the
  field, which is what she is then sent.
- **A new project starts from the default form** (a Description and a Date) unless she
  names the fields; she can also say a field is `required: false` or `long_text`.

## Quick starts

The Mira welcome offers action-shaped prompts ("Set up a project", "Add a task with
a due date", "Schedule something") alongside the original ones. Choosing one fills
the message box so you can edit it before sending.

## Streaming, thinking and history

Replies arrive as they are written; Markdown renders (bold, lists, code) with no
raw HTML ever injected. If the model provides a summary of its reasoning it shows
while she works and stays under **How Mira approached this**. Conversations are
saved to your account and reopened from **History**; each can be deleted. See
[Mira (API)](../api/mira.md#streaming-a-reply).

## Voice

The microphone button dictates into the message box using the browser's own speech
recognition (Chrome and Edge; hidden where unsupported). It is tuned for writing, not just
transcription: it prefers the reading that contains *Mira*, corrects the ways her name is
misheard, understands spoken punctuation ("comma", "full stop", "question mark", "new line")
and adds commas and full stops from the length of your pauses. Details are in
[Post-review improvements](whats-new.md#dictation). It runs in the browser; Chronicles'
servers never receive audio.

## Adding a function

1. Add an argument model, a declaration (`_tool(...)`) and a summary sentence in
   `mira_tools.py`, and `_register` it (mark `destructive=True` if it deletes).
2. Add its handler to `frontend/src/miraActions.js`, using existing API calls.
3. The catalogue test fails until a summary exists for every function, and the
   frontend test counts the handlers, which keeps the two sides in step.

## Testing

- `backend/tests/test_mira_tools.py`: every function has a declaration, validator and
  summary; invalid calls are refused with a readable reason; several calls in one
  reply; a bad call among good ones; the context (contents, isolation between users,
  truncation, "nothing yet"); the endpoint end to end; consent versioning.
- `backend/tests/test_mira_conversations.py`: streaming, persistence, ordering,
  isolation, history.
- `frontend/src/miraActions.test.js`: every handler, name resolution, batching, progress,
  failure and skipping, the built-in title and time, required fields, limits, dates and
  choices, the default form of a new project, and that a batch never throws.
- `frontend/src/App.test.jsx`, `MiraAssistant.test.jsx`: the step card in each state, acting
  straight away, asking first, deleting always asking, Mira being told about a failure
  and answering it (twice at most), stopping a reply, and the remembered setting.
- `frontend/src/api.test.js`: the results turn and the stop signal.

## Limits

Mira can't run in parallel with another reply, can't undo what she's done (use entry
history, deleted entries or archive), sees only what is in the snapshot, and can be
wrong: review cards before confirming. The AI provider's own terms apply to what is
sent; see [External Services](../api/external-services.md).
