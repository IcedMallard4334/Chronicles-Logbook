# Projects

All project endpoints require authentication (`Authorization: Bearer <token>`).

## List projects

```
GET /projects
```

Returns all projects owned by the authenticated user, newest first.

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
    "created_at": "...",
    "updated_at": "..."
  }
]
```

`total_time_spent` is the sum of `time_spent` (in minutes) across all entries in the project.

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
