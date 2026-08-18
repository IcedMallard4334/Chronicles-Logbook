# Tasks API

All task endpoints require authentication and are scoped to a project.

## List tasks

```
GET /projects/{project_id}/tasks
```

Returns all tasks for a project, ordered by due date.

**Query parameters:**

| Parameter | Type | Description |
|---|---|---|
| `completed` | boolean | Filter by completion status |

**Response:** `200 OK`

```json
[
  {
    "id": "...",
    "project_id": "...",
    "title": "Write unit tests",
    "description": "Cover auth and project endpoints",
    "due_date": "2026-08-25",
    "completed": false,
    "created_at": "...",
    "updated_at": "..."
  }
]
```

---

## Create task

```
POST /projects/{project_id}/tasks
```

**Body:**

```json
{
  "title": "Write unit tests",
  "description": "Cover auth and project endpoints",
  "due_date": "2026-08-25"
}
```

| Field | Type | Required | Description |
|---|---|---|---|
| `title` | string (1–255 chars) | Yes | Task title |
| `description` | string | No | Detailed description |
| `due_date` | date (YYYY-MM-DD) | No | When the task is due |

**Response:** `201 Created` — returns the created task.

---

## Get task

```
GET /projects/{project_id}/tasks/{task_id}
```

**Response:** `200 OK` — returns the task.

---

## Update task

```
PUT /projects/{project_id}/tasks/{task_id}
```

**Body:** (all fields optional)

```json
{
  "title": "Updated title",
  "description": "Updated description",
  "due_date": "2026-09-01",
  "completed": true
}
```

**Response:** `200 OK` — returns the updated task.

---

## Toggle task completion

```
PATCH /projects/{project_id}/tasks/{task_id}/toggle
```

Flips the `completed` boolean.

**Response:** `200 OK` — returns the updated task.

---

## Delete task

```
DELETE /projects/{project_id}/tasks/{task_id}
```

**Response:** `204 No Content`
