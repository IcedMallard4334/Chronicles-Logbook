# Mira

Mira is the assistant built into Chronicles. These endpoints are what the app
uses to consent to Mira, keep a person's conversations, and stream her replies.
What Mira can *do*, how her proposals are checked, and what she is shown are
covered in [Mira: actions, context and consent](../features/mira-actions.md).

All routes need a signed-in user. A conversation belongs to the person who
created it; anyone else asking for it gets `404`, the same as if it did not
exist.

## Consent

### `GET /ai/consent`

```json
{ "decided": true, "accepted": true, "version": "2026-09-30" }
```

`decided` is `false` until the person has answered **for the current notice
version**. A choice saved against an older version no longer counts, so when
Mira's reach grows (as it did on 30 September 2026, when she gained a snapshot
of the workspace and the ability to act) everyone is asked again.

### `PUT /ai/consent`

Body `{ "accepted": true }` (strict boolean, nothing else allowed). Saves the
choice, its time and the notice version, and returns the same shape as `GET`.

Without `accepted: true` for the current version, **nothing** is sent to the AI
provider and no workspace snapshot is built: Mira answers from a fixed
"limited mode" message.

## Conversations

| Method & path | Purpose |
|---|---|
| `GET /ai/conversations` | The caller's conversations, most recently active first (up to 100). |
| `POST /ai/conversations` | Start an empty conversation. `201` with `{id, title, updated_at}`. |
| `GET /ai/conversations/{id}` | One conversation with its messages in order. |
| `DELETE /ai/conversations/{id}` | Delete it and its messages. `204`. |

A conversation is titled from its first message (first 60 characters).

Each message is `{id, role, content, thinking, created_at}`. `role` is `user`
or `assistant`; `thinking` is Mira's own summary of how she approached an answer,
when the model supplied one.

## Streaming a reply

### `POST /ai/conversations/{id}/stream`

```json
{ "message": "Add a task called Send the report, due next Monday", "today": "2026-09-30" }
```

| Field | Notes |
|---|---|
| `message` | 1 to 2000 characters. |
| `today` | Optional. The caller's *local* date, so "tomorrow" means theirs: the server runs on UTC. |

Unknown fields are refused (`422`). The response is `text/event-stream`; each
event is one line `data: {json}` followed by a blank line.

| `type` | Fields | Meaning |
|---|---|---|
| `start` | `conversation_id`, `title` | The exchange has been saved and streaming begins. |
| `thought` | `text` | A piece of Mira's reasoning summary (only if the model provides one). |
| `delta` | `text` | A piece of the reply, to be appended. |
| `action` | `action` | A **proposal**, see below. There can be several in one reply. |
| `error` | `detail` | The reply failed; nothing is saved for it. |
| `done` | | The stream is finished. Always the last event. |

### The `action` event

```json
{
  "type": "action",
  "action": {
    "type": "create_task",
    "payload": { "project": "Bug Log", "title": "Send the report", "due_date": "2026-10-05", "checklist": [] },
    "requires_confirmation": true,
    "destructive": false,
    "summary": "Add the task “Send the report” to “Bug Log”, due 2026-10-05"
  }
}
```

An `action` is only a proposal: **the server never performs it.** The browser
shows `summary`, and runs the action through the ordinary API (the same calls a
manual edit makes) only when the person confirms. `destructive` is `true` for
deletions, which are never run without an explicit confirmation.

The proposal list is also saved into the stored assistant message under
**Proposed for your approval**, so a reopened conversation still says what was
proposed.

### Errors

| Status | When |
|---|---|
| `401` | Not signed in. |
| `404` | The conversation isn't the caller's. |
| `422` | Blank or oversized message, or an unknown field. |

Failures *while* streaming (the provider being down or not configured) arrive as
an `error` event rather than a status code, because the `200` has already gone.

## Legacy single-shot chat

`POST /ai/chat` (`{ "message": "..." }`) returns one complete `{ "reply": ... }`
with no saved conversation, no workspace snapshot and only the original
`create_project` proposal. It is kept for scripts that used it in earlier
sprints; the app itself uses the streaming endpoint above.
