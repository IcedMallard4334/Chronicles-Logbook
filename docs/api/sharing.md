# Sharing

All sharing endpoints require authentication (`Authorization: Bearer <token>`).

A project belongs to the account that created it. Its owner can share it with
other Chronicles accounts so more than one person can keep the same logbook.

## What a share grants

Sharing deliberately grants less than ownership:

| Action | Owner | Shared with |
|---|---|---|
| See the project, its entries and its tasks | Yes | Yes |
| Add entries | Yes | Yes |
| Add tasks | Yes | Yes |
| Tick a task off, or reopen it | Yes | Yes |
| Edit or delete an entry | Yes | No |
| Edit or delete a task | Yes | No |
| Change the entry schema | Yes | No |
| Archive, unarchive or delete the project | Yes | No |
| Export the project | Yes | No |
| Share it with someone else | Yes | No |

Ticking work off is the point of a shared task list, so a collaborator may do
it. Rewording a task or removing it is a change to the shape of the work rather
than a report of progress, so it stays with the owner.

The reason for the split is that a logbook is a record. Someone invited to
contribute to it should not be able to reshape or remove what is already
there — a collaborator who could rewrite the schema or archive the project
could destroy the history the owner is keeping.

Projects shared with you appear in `GET /projects` alongside your own, marked
with `"shared": true`. Your own projects always report `"shared": false`.

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
    "avatar_url": null
  }
]
```

**Errors:**

| Status | Meaning |
|---|---|
| `404 Not Found` | No such project, or it is not yours and has not been shared with you |

---

## Share a project

```
POST /projects/{project_id}/members
```

Only the owner may share. The invited person must already have a Chronicles
account — sharing does not send an invitation to a stranger.

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
  "avatar_url": null
}
```

Sharing is idempotent: inviting someone who already has access returns them
with `201` rather than failing, so a double submit cannot produce an error the
person has no way to act on.

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

Only the owner may withdraw access. Entries the person already added stay in
the project — removing their access does not remove their contributions.

**Response:** `204 No Content`

Removing someone who does not currently have access also returns `204`, so
retrying a failed request is safe.

**Errors:**

| Status | Meaning |
|---|---|
| `404 Not Found` | No such project, or you do not own it |

---

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

- **A collaborator cannot leave a project.** Only the owner can withdraw
  access, so someone shared a project they do not want cannot remove it
  themselves.
- **Statistics and export remain owner-only.** A collaborator sees the project,
  its entries and its tasks, but not its statistics page or its export, because
  those endpoints still filter strictly on ownership.
- **Sharing is all or nothing.** There are no roles: everyone a project is
  shared with gets the same access. Roles would need a column on
  `project_members` and a check at each site that currently only asks whether
  the caller is a member.
