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
    "created_at": "...",
    "updated_at": "..."
  }
]
```

`total_time_spent` is the sum of `time_spent` (in minutes) across all entries in the project.

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

**Response:** `200 OK` — returns the updated project.

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

## Create entry

```
POST /projects/{project_id}/entries
```

**Body:**

```json
{
  "data": {
    "field-id-1": 3,
    "field-id-2": "Finished login page"
  },
  "time_spent": 90
}
```

| Field | Type | Required | Description |
|---|---|---|---|
| `data` | object | Yes | Values keyed by field ID from the project's `entry_schema` |
| `time_spent` | integer | No | Time spent on the entry, in minutes |

!!! note
    The keys in `data` must match the `id` values in the project's `entry_schema`. The backend validates that all required fields are present and that types match.

**Response:** `201 Created` — returns the created entry.

**Errors:** `422` for schema validation failures, `409` if the project is archived.

---

## List entries

```
GET /projects/{project_id}/entries
```

Returns all entries for a project, ordered newest first.

**Response:** `200 OK`

```json
[
  {
    "id": "...",
    "project_id": "...",
    "data": { "field-id-1": 3, "field-id-2": "Finished login page" },
    "time_spent": 90,
    "created_at": "...",
    "updated_at": "..."
  }
]
```

---

## Get entry

```
GET /projects/{project_id}/entries/{entry_id}
```

**Response:** `200 OK` — returns the entry.

---

## Update entry

```
PUT /projects/{project_id}/entries/{entry_id}
```

**Body:** (all fields optional)

```json
{
  "data": { "field-id-1": 4, "field-id-2": "Updated text" },
  "time_spent": 120
}
```

**Response:** `200 OK` — returns the updated entry.

---

## Delete entry

```
DELETE /projects/{project_id}/entries/{entry_id}
```

**Response:** `204 No Content`

---

## Field types

The `entry_schema` supports the following field types:

| Type | Description |
|---|---|
| `text` | Free-form text |
| `number` | Integer or float |
| `date` | ISO date string |
| `dropdown` | One of a predefined list of `options` |
