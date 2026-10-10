# Project notes

A **note** is free text kept on a project, for what does not fit an entry: a reminder, a decision the team reached,
a link to keep. It is either **private** (only its author can see it) or **shared** (everyone on the project can,
with the author's name). It has no schema, no version history, and is not counted in any statistic.

All four endpoints need `Authorization: Bearer <token>` ([Authentication](authentication.md)). Anyone who can read
the project (the owner and accepted members, see [Sharing](sharing.md)) may use them; anyone else gets
`404 Project not found`, the same as for a project that does not exist.

## Who can do what

| | Author | Project owner (not the author) | Other member |
|---|---|---|---|
| See a **private** note | Yes | **No** | No |
| See a **shared** note | Yes | Yes | Yes |
| Edit, pin, or change visibility | Yes | No | No |
| Delete a **private** note | Yes | No | No |
| Delete a **shared** note | Yes | Yes | No |

The owner can take down a shared note that should not stay on the team's page, but has no power over somebody
else's private one. Why: DB-70 in [Decisions: data and backend](../decisions/data-and-backend.md).

**Private notes are filtered in the query, not after it.** The list is "shared notes, plus my own private ones", so
another person's private note is never loaded for you. Asking for one by id (to edit or delete) returns
`404 Note not found`, not `403`, so an id cannot be used to learn that a private note exists.

## The note object

```json
{
  "id": "6c1f...",
  "project_id": "a2b9...",
  "author": { "user_id": "3d7e...", "full_name": "Sam Dube", "avatar_url": null },
  "body": "Centrifuge booked Thursday 10:00",
  "visibility": "shared",
  "pinned": false,
  "created_at": "2026-10-10T08:00:00Z",
  "updated_at": "2026-10-10T08:00:00Z",
  "mine": false,
  "can_edit": false,
  "can_delete": true
}
```

`mine`, `can_edit` and `can_delete` are worked out by the server for the caller, so a client never has to repeat the
permission rules. `author.full_name` is `"Former member"` (and `user_id` is `null`) when the author's account has been
deleted; a shared note outlives its author, a private one is then readable by nobody.

## Endpoints

### `GET /projects/{project_id}/notes`

The shared notes plus the caller's own private ones: pinned first, then the most recently changed, at most 200.
Optional `?visibility=private` or `?visibility=shared` narrows it (`private` still means only the caller's own);
any other value is `422`.

Optional `?q=` searches: it keeps the notes whose **text or author's name** contains the term, in any case. The term
is trimmed, a blank one is ignored, and more than 200 characters is `422`. `%` and `_` are ordinary characters, so
`?q=50%25` finds "50%" rather than everything. The search is applied **on top of** the visibility rule, never instead
of it, so it cannot surface someone else's private note. It can be combined with `visibility`.

### `POST /projects/{project_id}/notes`

```json
{ "body": "Remember the 0.5 mL tubes", "visibility": "private", "pinned": false }
```

`visibility` defaults to `private` and `pinned` to `false`. `body` is required, trimmed, and 1 to 5,000 characters;
a blank one is `422`. Returns `201` with the note.

### `PUT /projects/{project_id}/notes/{note_id}`

Send any of `body`, `visibility`, `pinned`. Only the author may: another member editing a **shared** note gets
`403 Only the author can change a note`; someone else's **private** note is `404`. Switching a shared note to
`private` hides it from everyone else straight away.

### `DELETE /projects/{project_id}/notes/{note_id}`

`204`. The author may delete their own note; the project's owner may also delete a **shared** one. A member trying
to delete someone else's shared note gets `403 You cannot delete this note`. A note id from a different project is
`404`. Deleting a project deletes its notes.

## Not offered

- **Reading one note by id.** The list is the only read; a project has few notes and the list is small.
- **Notes on an entry or a task.** A note belongs to a project; an entry already has its own free-text fields.
- **Search across projects, or counts in the statistics.** Search works inside one project only. See DB-70.

AI Declaration: Written with Claude Code (Sonnet 5.5) from `app/routers/notes.py` and its tests, 2026-10-10.
