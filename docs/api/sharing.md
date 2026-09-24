# Sharing

All sharing endpoints require authentication (`Authorization: Bearer <token>`).

A project belongs to the account that created it. Its owner can invite other
Chronicles accounts to it so more than one person can keep the same logbook.

Sharing is an **invitation, not a grant**: nothing about the project reaches
the invitee's workspace until they accept it. Someone else's project
appearing in your sidebar unasked is a notification at best and an imposition
at worst, and under the old grant model there was no way to give it back.

## What accepting grants

Accepting deliberately grants less than ownership:

| Action | Owner | Accepted member |
|---|---|---|
| See the project, its entries and its tasks | Yes | Yes |
| Add entries | Yes | Yes |
| Add tasks | Yes | Yes |
| Tick a task off, or reopen it | Yes | Yes |
| Edit or delete an entry **they wrote themselves** | Yes | Yes |
| Edit or delete an entry **someone else wrote** | Yes | No |
| Edit or delete a task | Yes | No |
| Change the entry schema | Yes | No |
| Archive, unarchive or delete the project | Yes | No |
| Export the project | Yes | No |
| Invite someone else, or withdraw someone's access | Yes | No |
| Leave the project | No — see below | Yes |

A member editing their own entry is correcting their own work; a member
editing someone else's is rewriting somebody else's record, which is not what
being invited to contribute means. The same reasoning covers tasks: ticking
one off reports progress, but rewording or removing one reshapes the work
itself, so both stay with the owner regardless of who created the task.

Only the owner can reshape or remove the project as a whole — its schema, its
existence, who else has access to it — for the same reason: a collaborator
who could do those things could destroy the record they were only invited to
contribute to.

Projects you've accepted appear in `GET /projects` alongside your own, marked
with `"shared": true`. Your own projects always report `"shared": false`.

---

## Being invited

```
GET /invitations
```

The invitations waiting for the caller's answer — projects they've been
asked to join and haven't yet accepted or declined.

**Response:** `200 OK`

```json
[
  {
    "project_id": "...",
    "project_name": "Fieldwork",
    "project_description": "...",
    "invited_by_name": "Thandi Mokoena",
    "entry_count": 12,
    "invited_at": "..."
  }
]
```

Carries the project and inviter by name, and how much is already recorded,
because "Thandi invited you to Fieldwork (12 entries)" is something you can
decide about and a pair of ids is not.

---

```
POST /invitations/{project_id}/accept
```

Accepts the invitation. From this point the project appears in
`GET /projects` and everything in the table above applies.

**Response:** `204 No Content`

**Errors:**

| Status | Meaning |
|---|---|
| `404 Not Found` | No invitation from this project is waiting for your answer (already answered, withdrawn, or never sent) |

---

```
POST /invitations/{project_id}/decline
```

Turns the invitation down. The project never touches your workspace; the
owner can see that you declined (see [list the people a project is shared
with](#list-the-people-a-project-is-shared-with)) and can ask again.

**Response:** `204 No Content`

**Errors:** same as accept.

---

## Leave a project

```
DELETE /projects/{project_id}/membership
```

Ends your own membership in a project someone else owns. The entries you
wrote stay exactly where they are — they're part of the project's record,
not of your access to it. Leaving only ends the access.

**Response:** `204 No Content`

**Errors:**

| Status | Meaning |
|---|---|
| `404 Not Found` | You are not a member of this project (including: you are its owner — an owner can't leave their own project, only archive or delete it) |

---

## List the people a project is shared with

```
GET /projects/{project_id}/members
```

Readable by the owner and by anyone who has accepted. Pending and declined
invitations are listed too, not just accepted ones — an owner who can't see
that an invitation is still unanswered will send it again.

**Response:** `200 OK`

```json
[
  {
    "user_id": "...",
    "full_name": "Second User",
    "email": "second@example.com",
    "avatar_url": null,
    "status": "accepted",
    "invited_at": "..."
  }
]
```

`status` is one of `pending`, `accepted`, `declined`.

**Errors:**

| Status | Meaning |
|---|---|
| `404 Not Found` | No such project, or you have neither accepted an invitation to it nor own it |

---

## Invite someone

```
POST /projects/{project_id}/members
```

Only the owner may invite. The invited person must already have a Chronicles
account — this doesn't send an email to a stranger, it creates a
notification the account holder sees inside the app (`GET /invitations`).

**Request body:**

```json
{ "email": "them@example.com" }
```

The address is matched case-insensitively.

**Response:** `201 Created`

```json
{
  "user_id": "...",
  "full_name": "Second User",
  "email": "second@example.com",
  "avatar_url": null,
  "status": "pending",
  "invited_at": "..."
}
```

Inviting is idempotent, and re-inviting means different things depending on
where the invitation already stands:

- **Already pending** — returns the existing invitation unchanged. A double
  submit can't produce an error the person has no way to act on, and can't
  reset a timestamp that hasn't actually changed anything.
- **Previously declined** — resets it to pending. Inviting someone who said
  no is presumably deliberate, so it asks again rather than silently doing
  nothing.
- **Already accepted** — returns their membership as-is.

**Errors:**

| Status | Meaning |
|---|---|
| `400 Bad Request` | The address belongs to the project's owner |
| `404 Not Found` | No account uses that address, or you do not own this project |
| `422 Unprocessable Entity` | No address was supplied |

---

## Withdraw access

```
DELETE /projects/{project_id}/members/{user_id}
```

Only the owner may do this — whether the invitation was accepted, still
pending, or declined. Entries the person already added stay in the project;
withdrawing access never removes their contributions.

**Response:** `204 No Content`

Removing someone with no membership row at all also returns `204`, so
retrying a failed request is safe.

**Errors:**

| Status | Meaning |
|---|---|
| `404 Not Found` | No such project, or you do not own it |

---

## Editing an entry in a shared project

```
PUT /projects/{project_id}/entries/{entry_id}
DELETE /projects/{project_id}/entries/{entry_id}
```

Both endpoints are readable by the owner and by an accepted member, but only
the owner or the entry's own author (`created_by`) may actually carry out
the change.

**Errors (in addition to the usual validation and archived-project ones):**

| Status | Meaning |
|---|---|
| `403 Forbidden` | You're an accepted member, but this entry was created by someone else |
| `404 Not Found` | No such project, or you have neither accepted an invitation to it nor own it |

---

## Who did what

A shared logbook that records what was done but not who did it is only half a
record, so entries and tasks carry their author.

| Field | On | Meaning |
|---|---|---|
| `created_by`, `created_by_name` | entries, tasks | Who wrote it |
| `completed_by`, `completed_by_name` | tasks | Who ticked it off |

Three rules make this behave:

- **All three are nullable.** Entries and tasks written before a project could
  be shared have no author, so "unknown" is a real state that the interface has
  to render as readably as a name — not an error. An entry with no author is
  also one only the project's owner can edit, since there's no `created_by`
  for a member to match against.
- **`completed_by` is cleared when a task is reopened**, so it always describes
  the completion that currently stands rather than whoever ticked it once
  before.
- **Deleting an account does not delete the work.** The foreign keys are
  `ON DELETE SET NULL`, not `CASCADE`: if a collaborator deletes their account,
  the entries they contributed to someone else's project stay, unattributed.
  The record outlives the contributor, which is the point of a logbook.

The names are resolved by a `selectin` relationship on the model rather than by
each endpoint joining for them, so any response carrying an entry or task
carries the name too.

### The schema is shared, not copied

There is one `entry_schema`, on the project. A change the owner makes is
immediately what collaborators see and fill in — there is no per-person copy to
drift out of step. Existing entries keep their own `schema_snapshot`, so an
entry written against an older shape still reads correctly afterwards; see
[Editing a live schema](schema.md#editing-a-live-schema) for how that
snapshot is kept in step with the schema an entry's data actually holds.

---

## Known limitations

Recorded rather than hidden, and candidates for future work:

- **Statistics and export remain owner-only.** A collaborator sees the project,
  its entries and its tasks, but not its statistics page or its export, because
  those endpoints still filter strictly on ownership.
- **Sharing is all or nothing.** There are no roles: everyone who has accepted
  gets the same access (subject to the owner-vs-author split on editing
  entries above). Roles would need a column on `project_members` and a check
  at each site that currently only asks whether the caller is a member.
- **No in-app notification beyond the invitations bell.** Accepting or
  declining doesn't email the owner; they find out by checking the members
  list.

AI Declaration: This page was substantially rewritten with Claude Code, Claude Sonnet 5, for the invite/accept/decline/leave flow and the per-entry authorship restriction; earlier content (originally reviewed and edited with Qoder) is carried forward where still accurate.
