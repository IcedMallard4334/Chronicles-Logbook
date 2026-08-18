# Entries API

All entry endpoints require authentication and are scoped to a project.

## List entries

```
GET /projects/{project_id}/entries
```

Returns all entries for a project, ordered by date (newest first).

**Response:** `200 OK`

```json
[
  {
    "id": "...",
    "project_id": "...",
    "entry_date": "2026-08-18T14:30:00+00:00",
    "data": {
      "Hours worked": 3,
      "What I did": "Finished login page",
      "Status": "Done"
    },
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
  "entry_date": "2026-08-18T14:30:00+00:00",
  "data": {
    "Hours worked": 3,
    "What I did": "Finished login page",
    "Status": "Done"
  }
}
```

!!! note
    The `data` keys should match the field names defined in the project's `entry_schema`. The backend validates that all provided fields exist in the schema.

**Response:** `201 Created` — returns the created entry.

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
  "entry_date": "2026-08-18T15:00:00+00:00",
  "data": {
    "Hours worked": 4,
    "Status": "In progress"
  }
}
```

**Response:** `200 OK` — returns the updated entry.

---

## Delete entry

```
DELETE /projects/{project_id}/entries/{entry_id}
```

**Response:** `204 No Content`
