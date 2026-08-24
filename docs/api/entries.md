# Entries

Entry endpoints require authentication. Project-scoped endpoints also require the caller to own the project.

## List project entries

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
    "data": {
      "field-id-1": 3,
      "field-id-2": "Finished login page"
    },
    "time_spent": 90,
    "created_at": "...",
    "updated_at": "..."
  }
]
```

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
  "data": {
    "field-id-1": 4,
    "field-id-2": "Updated text"
  },
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

## Search entries globally

```
GET /entries
```

Returns entries across all projects owned by the authenticated user, ordered newest first.

**Query parameters:**

| Parameter | Type | Default | Description |
|---|---|---|---|
| `q` | string | — | Keyword matched against project name and entry field values |
| `project_id` | UUID | — | Filter to a single project |
| `page` | integer | 1 | Page number |
| `page_size` | integer | 20 | Items per page (max 100) |

**Response:** `200 OK`

```json
[
  {
    "id": "...",
    "project_id": "...",
    "project_name": "My Project",
    "data": { "field-id-1": 3, "field-id-2": "Finished login page" },
    "time_spent": 90,
    "created_at": "...",
    "updated_at": "..."
  }
]
```
