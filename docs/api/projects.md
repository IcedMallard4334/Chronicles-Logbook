# Projects

All project endpoints require authentication (`Authorization: Bearer <token>`).

## List projects

```
GET /projects
```

Returns every project the authenticated user can see — the ones they own and the
ones shared with them — newest first.

**Query parameters:**

| Parameter | Type | Default | Description |
|---|---|---|---|
| `archived` | boolean | — | Filter by archive status |

**Response:** `200 OK`

```json
[
  {
    "id": "...",
    "name": "My Project",
    "description": "...",
    "entry_schema": [
      { "id": "...", "name": "Hours spent", "type": "number" },
      { "id": "...", "name": "What I did", "type": "text" }
    ],
    "archived": false,
    "total_time_spent": 240,
    "retired_schema": [],
    "shared": false,
    "created_at": "...",
    "updated_at": "..."
  }
]
```

`total_time_spent` is the sum of `time_spent` (in minutes) across all entries in the project.

`shared` is `true` when the project reached you through a share rather than
being yours, in which case you may read it and add entries but not change its
schema, archive it or export it. See [Sharing](sharing.md).

`retired_schema` holds fields the project used to ask for. See [Schema and field types](schema.md#retired-fields-in-responses).

---

## Create project

```
POST /projects
```

**Body:**

```json
{
  "name": "My Project",
  "description": "Optional description",
  "entry_schema": [
    { "name": "Hours spent", "type": "number" },
    { "name": "What I did", "type": "text" }
  ]
}
```

If `entry_schema` is omitted, it defaults to an empty list.

**Response:** `201 Created` — returns the created project.

---

## Get project

```
GET /projects/{project_id}
```

**Response:** `200 OK` — returns the project, including `total_time_spent`.

**Errors:** `404` if not found.

---

## Update project

```
PUT /projects/{project_id}
```

**Body:** (all fields optional)

```json
{
  "name": "New Title",
  "description": "Updated description",
  "entry_schema": [
    { "id": "...", "name": "Hours spent", "type": "number" },
    { "id": "...", "name": "Status", "type": "dropdown", "options": ["In progress", "Done"] }
  ]
}
```

Use this endpoint to update the project's entry schema as well as its name and description.

!!! warning "Changing the schema migrates existing entries"
    A different `entry_schema` is not simply stored: every entry in the project
    is migrated to the new shape, with new fields backfilled and values that no
    longer fit retired rather than deleted. The rules are documented on
    [Schema and field types](schema.md#editing-a-live-schema).

    To see what a change would do before making it, use
    [`POST /projects/{project_id}/schema/preview`](schema.md#preview-a-schema-change).

**Response:** `200 OK` — returns the updated project.

**Errors:** `409` if the project is archived *and* the schema differs from the one it already has.

---

## Preview and apply a schema change

```
POST /projects/{project_id}/schema/preview
PUT  /projects/{project_id}/schema
```

The preview endpoint reports what a schema change would do to entries already
recorded; the apply endpoint makes the change and reports what it did. Both are
documented in full on [Schema and field types](schema.md).

---

## Archive project

```
POST /projects/{project_id}/archive
```

Sets `archived` to `true`. Archived projects cannot receive new entries.

**Response:** `200 OK` — returns the updated project.

---

## Unarchive project

```
POST /projects/{project_id}/unarchive
```

Sets `archived` to `false`.

**Response:** `200 OK` — returns the updated project.

---

## Delete project

```
DELETE /projects/{project_id}
```

Permanently removes the project together with **every entry, task and share**
belonging to it. Only the owner may delete; a project shared with you is not
yours to remove.

**Archiving is the ordinary way to finish with a project**, because it keeps the
record. Deletion is for a project that should never have existed — a mistake, a
duplicate, a test. The interface asks for the project's name back before calling
this, the same bar the account deletion sets.

**Response:** `204 No Content`

**Errors:**

| Status | Meaning |
|---|---|
| `404 Not Found` | No such project, or it is not yours — including a project shared with you |

Deleting the same project twice returns `404` the second time: it is no longer
yours to delete.

### What happens to links pointing at it

A `project_reference` field in *another* project that pointed at this one is
deliberately left as it is. It then reads as "Links to a project you no longer
have", which is true. Clearing it would make the field read as though it had
never been pointed anywhere, which is a different situation with a different fix.

### Why the children are deleted explicitly

`tasks.project_id` carries no `ON DELETE` behaviour, so PostgreSQL would refuse
to delete a project that still had tasks. SQLite does not enforce foreign keys
unless asked to, so the test suite would not have caught that. The endpoint
therefore removes tasks, entries and shares itself rather than relying on the
database to cascade.

---

## Entry endpoints

Entries live under a project, so their routes are project-scoped:

```
POST   /projects/{project_id}/entries
GET    /projects/{project_id}/entries
GET    /projects/{project_id}/entries/{entry_id}
PUT    /projects/{project_id}/entries/{entry_id}
DELETE /projects/{project_id}/entries/{entry_id}
```

These are documented in full on the [Entries](entries.md) page, including
idempotent creation, schema revalidation on update, and error codes.

---

## Field types

The `entry_schema` supports the following field types:

| Type | Description |
|---|---|
| `text` | Free-form text |
| `number` | Integer or float |
| `date` | ISO date string |
| `dropdown` | One of a predefined list of `options` |
| `project_reference` | The id of another project owned by the same user, or `null` |
| `computed` | A number derived by the server from an `expression` over the entry's other number fields |

The last two carry extra keys and extra rules — see
[Schema and field types](schema.md#field-types).

AI Declaration: The preceding document was reviewed and edited with: Qoder, Claude Opus 5
