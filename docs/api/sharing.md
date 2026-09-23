# Sharing

All sharing endpoints require authentication (`Authorization: Bearer <token>`).

A project belongs to the account that created it. Its owner can invite other
Chronicles accounts to it so more than one person can keep the same logbook.

**Sharing is an invitation, not a grant.** Inviting somebody creates a pending
membership: the project does not appear in their workspace and they can read
nothing in it until they accept. This replaced an earlier design in which
typing an email put a stranger's project straight into that person's sidebar,
with no way to give it back.

## What a share grants

Sharing deliberately grants less than ownership:

| Action | Owner | Accepted member | Invited, unanswered |
|---|---|---|---|
| See the project, its entries and its tasks | Yes | Yes | No |
| Add entries | Yes | Yes | No |
| Add tasks | Yes | Yes | No |
| Tick a task off, or reopen it | Yes | Yes | No |
| Edit or delete **their own** entry | Yes | Yes | No |
| Edit or delete **somebody else's** entry | Yes | No | No |
| Edit or delete a task | Yes | No | No |
| Change the entry schema | Yes | No | No |
| Archive, unarchive or delete the project | Yes | No | No |
| Export the project | Yes | No | No |
| Invite somebody else | Yes | No | No |
| Leave the project | No | Yes | - |

Ticking work off is the point of a shared task list, so a collaborator may do
it. Rewording a task or removing it is a change to the shape of the work rather
than a report of progress, so it stays with the owner.

A collaborator may correct or remove **the entries they wrote themselves**. A
contributor who cannot fix their own typo has to ask the owner to do it; a
contributor who can rewrite everybody else's entries is no longer contributing
to somebody's record.

An owner cannot leave their own project - archiving and deleting are how an
owner finishes with one. Leaving would orphan a record with nobody responsible
for it.

The reason for the split is that a logbook is a record. Someone invited to
contribute to it should not be able to reshape or remove what is already
there — a collaborator who could rewrite the schema or archive the project
could destroy the history the owner is keeping.

Projects you have **accepted** appear in `GET /projects` alongside your own,
marked with `"shared": true`. Your own projects always report `"shared": false`.
A project you have been invited to but not answered appears only in
`GET /invitations`.

---

## List the people a project is shared with

```
GET /projects/{project_id}/members
```

Readable by the owner and by anyone the project is shared with.

**Response:** `200 OK`

```json
[
  {
    "user_id": "...",
    "full_name": "Second User",
    "email": "second@example.com",
    "avatar_url": null,
    "status": "pending",
    "invited_at": "2026-09-14T09:00:00Z"
  }
]
```

`status` is `pending`, `accepted` or `declined`. Unanswered and declined
invitations are listed too: an owner who cannot see that an invitation is
unanswered will simply send it again.

**Errors:**

| Status | Meaning |
|---|---|
| `404 Not Found` | No such project, or it is not yours and has not been shared with you |

---

## Invite somebody to a project

```
POST /projects/{project_id}/members
```

Only the owner may invite. The invited person must already have a Chronicles
account — this does not send an email to a stranger.

Nothing is granted here. The membership is created with `status: "pending"`,
and the invitee finds it in `GET /invitations`.

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
  "invited_at": "2026-09-14T09:00:00Z"
}
```

Inviting is idempotent: re-inviting somebody returns their existing invitation
with `201` rather than failing, so a double submit cannot produce an error the
person has no way to act on. Re-inviting somebody who **declined** moves the
same row back to `pending` — doing it deliberately can only mean asking again —
rather than stacking up a second invitation.

**Errors:**

| Status | Meaning |
|---|---|
| `400 Bad Request` | The address belongs to the project's owner |
| `404 Not Found` | No account uses that address, or you do not own this project |
| `422 Unprocessable Entity` | No address was supplied |

---

## Withdraw access, or cancel an invitation

```
DELETE /projects/{project_id}/members/{user_id}
```

Only the owner may do this, and it covers both cases: taking access away from
somebody who accepted, and cancelling an invitation nobody has answered.
Entries the person already added stay in the project — removing their access
does not remove their contributions.

**Response:** `204 No Content`

Removing someone who does not currently have access also returns `204`, so
retrying a failed request is safe.

**Errors:**

| Status | Meaning |
|---|---|
| `404 Not Found` | No such project, or you do not own it |

---

## Leave a project

```
DELETE /projects/{project_id}/membership
```

The other half of an invitation, and the thing that was missing entirely: a
collaborator can step away from a project they no longer contribute to,
without having to ask its owner.

The entries they wrote stay where they are — they are part of that project's
record, not of anyone's access to it. The owner can invite them back, which
creates a fresh pending invitation.

**Response:** `204 No Content`

**Errors:**

| Status | Meaning |
|---|---|
| `404 Not Found` | You are not a member of this project — including when you own it |

---

## Invitations, from the invitee's side

### List the invitations waiting for you

```
GET /invitations
```

**Response:** `200 OK`

```json
[
  {
    "project_id": "...",
    "project_name": "Reading Group",
    "project_description": "Papers we are working through together",
    "invited_by_name": "Sipho Ndlovu",
    "entry_count": 12,
    "invited_at": "2026-09-14T09:00:00Z"
  }
]
```

The project and the inviter are carried by name, alongside how much is already
in the logbook: "Sipho invited you to Reading Group (12 entries)" is something
you can decide about, and a pair of ids is not.

### Accept

```
POST /invitations/{project_id}/accept
```

From here the project appears in `GET /projects` with `"shared": true`, and
entries can be written in it.

**Response:** `204 No Content`

### Decline

```
POST /invitations/{project_id}/decline
```

The membership is kept with `status: "declined"` rather than deleted, so that
declining is an answer the owner can see rather than silence.

**Response:** `204 No Content`

### Errors, for both

| Status | Meaning |
|---|---|
| `404 Not Found` | This invitation is no longer waiting for an answer |

Answering twice is the ordinary consequence of a double click or a stale tab,
so an already-answered invitation reads as "not found" rather than as a server
error.

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
  to render as readably as a name — not an error.
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
entry written against an older shape still reads correctly afterwards.

---

## Known limitations

Recorded rather than hidden, and candidates for the next sprint:

- **No email is sent.** An invitation appears in the invitee's workspace and
  nowhere else, so somebody who does not open Chronicles will not know it is
  there. Sending one would reuse the transactional email path that password
  resets already use.
- **Statistics and export remain owner-only.** A collaborator sees the project,
  its entries and its tasks, but not its statistics page or its export, because
  those endpoints still filter strictly on ownership.
- **Sharing is all or nothing.** There are no roles: everyone a project is
  shared with gets the same access. Roles would need a column on
  `project_members` and a check at each site that currently only asks whether
  the caller is a member.
