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
2. **A list of 26 functions** she can call, covering the everyday things you do.
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
| **The app** | `open_page`, `set_theme` |

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

## Confirming: one click, never silent

Every proposal appears as a card listing what she would do in plain sentences, for
example:

> **Mira would like to do 3 things**
> 1. Create project “Launch” with 2 fields
> 2. Add the task “Write copy” to “Launch”, due 2026-10-05
> 3. Schedule “Launch review” on 2026-10-08
>
> *Nothing has changed yet.* **[Cancel] [Do all 3]**

Deletions are flagged *"this can't be undone"*. Confirming runs the actions **in
order** through the same authenticated calls a manual edit makes, so every ordinary
permission and validation rule applies: she can't do anything you couldn't.

- Each action resolves names against what exists *at that moment*, so a later
  action can use something an earlier one created.
- It **stops at the first failure**, because later actions may depend on it, and
  reports what was done, what failed and why, and how many were not run.
- The outcome is posted in the chat (`✓ Created project “Launch”`).

### The fast path

For speed there's an opt-in under the message box, **Run simple changes straight
away**. With it on, a reply whose actions only *add or edit* runs immediately after
she finishes, with no card. A reply that contains **any deletion** always waits
for a click, whatever the setting. It is off by default and remembered per browser.

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
recognition (Chrome and Edge; hidden where unsupported). The optional **page
reader** in Profile reads the page aloud. Both run in the browser; Chronicles' servers
never receive audio.

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
- `frontend/src/miraActions.test.js`: every handler, name resolution, batching, failure
  and skipping.
- `frontend/src/App.test.jsx`, `MiraAssistant.test.jsx`: the proposal card, confirming,
  cancelling, stopping at a failure, and the fast path (and that deletions bypass it).

## Limits

Mira can't run in parallel with another reply, can't undo what she's done (use entry
history, deleted entries or archive), sees only what is in the snapshot, and can be
wrong: review cards before confirming. The AI provider's own terms apply to what is
sent; see [External Services](../api/external-services.md).
