# Projects API

All project endpoints require authentication (`Authorization: Bearer <token>`).

## List projects

```
GET /projects
```

Returns all projects owned by the authenticated user.

**Query parameters:**

| Parameter | Type | Default | Description |
|---|---|---|---|
| `archived` | boolean | — | Filter by archive status |

**Response:** `200 OK`

```json
[
  {
    "id": "...",
    "title": "My Project",
    "description": "...",
    "entry_schema": { "fields": [...] },
    "stats": {},
    "archived_at": null,
    "created_at": "...",
    "updated_at": "..."
  }
]
```

---

## Create project

```
POST /projects
```

**Body:**

```json
{
  "title": "My Project",
  "description": "Optional description"
}
```

**Response:** `201 Created` — returns the created project.

---

## Get project

```
GET /projects/{project_id}
```

**Response:** `200 OK` — returns the project.

**Errors:** `404` if not found.

---

## Update project

```
PUT /projects/{project_id}
```

**Body:** (all fields optional)

```json
{
  "title": "New Title",
  "description": "Updated description"
}
```

**Response:** `200 OK` — returns the updated project.

---

## Archive project

```
POST /projects/{project_id}/archive
```

Sets `archived_at` to the current timestamp.

**Response:** `200 OK` — returns the updated project.

---

## Unarchive project

```
POST /projects/{project_id}/unarchive
```

Clears the `archived_at` field.

**Response:** `200 OK` — returns the updated project.

---

## Set entry schema

```
PUT /projects/{project_id}/schema
```

Defines the custom fields for entries in this project.

**Body:**

```json
{
  "fields": [
    { "name": "Hours worked", "type": "number" },
    { "name": "What I did", "type": "text" },
    { "name": "Status", "type": "dropdown", "options": ["In progress", "Done"] }
  ]
}
```

**Field types:** `text`, `number`, `date`, `dropdown`

**Response:** `200 OK` — returns the updated project.
