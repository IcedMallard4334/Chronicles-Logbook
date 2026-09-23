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
    "retired_data": {},
    "created_at": "...",
    "updated_at": "..."
  }
]
```

`retired_data` holds values recorded under fields the project no longer asks
for. See [Schema and field types](schema.md#retired-fields-in-responses).

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
| `id` | UUID | No | Client-supplied identifier. Makes creation idempotent — see below |
| `created_at` | datetime | No | Original capture time. Defaults to the moment the server receives the request |

!!! note
    The keys in `data` must match the `id` values in the project's `entry_schema`. The backend validates that all required fields are present and that types match.

    Two field types are exceptions. A `computed` field is derived by the server
    and anything sent for it is discarded. A `project_reference` may be omitted
    or sent as `null`. See [Schema and field types](schema.md#field-types).

**Response:** `201 Created` — returns the created entry.

**Errors:** `422` for schema validation failures, `409` if the project is archived.

### Idempotent creation

`id` and `created_at` exist for callers that already know an entry's identity and real capture time — offline sync and import. Ordinary online capture omits both and lets the server assign them.

When `id` is supplied and an entry with that id already exists in the same project, the request returns **`200 OK`** with the existing entry instead of creating a duplicate with `201`. A client can therefore safely replay a request whose response was lost without risking a double entry, and can use the status code to tell "already stored" from "just created".

An `id` that exists in a *different* project returns `409 Conflict`. The response never includes the other entry, so a colliding id cannot be used to read another user's data.

`created_at` accepts a timezone-aware or naive timestamp; naive values are read as UTC. Timestamps in the future are rejected with `422`, which guards against a device with a skewed clock pinning an entry to the top of the timeline permanently.

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

| Field | Type | Description |
|---|---|---|
| `data` | object | Replacement values. Revalidated against the project's **current** schema |
| `time_spent` | integer \| null | Omit to leave unchanged; send `null` to clear a recorded duration |

!!! warning "Editing an entry after the schema has changed"
    `data` is validated exactly as it is on create: every field in the project's current `entry_schema` must be present, and no others are allowed.

    If the schema changed after the entry was written, the update must satisfy the **new** shape. Values for fields that no longer exist in the schema are not carried over. Editing a typo on an old entry therefore migrates that entry to the current schema.

    In practice a schema change already migrates every entry as it is made — see
    [Editing a live schema](schema.md#editing-a-live-schema) — so an entry is
    normally in the current shape before anyone edits it.

`created_at` cannot be changed. An entry's capture time is set once, at creation, so editing an entry never moves it in the timeline.

**Response:** `200 OK` — returns the updated entry.

**Errors:** `422` for schema validation failures, `404` if the entry does not exist in that project, `409` if the project is archived.

---

## Delete entry

```
DELETE /projects/{project_id}/entries/{entry_id}
```

Deletion is permanent; there is no soft delete or restore.

**Response:** `204 No Content`

**Errors:** `404` if the entry does not exist in that project, `409` if the project is archived.

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
| `tag` | string | — | Only entries whose tag-type fields contain this tag (case-insensitive) |
| `todo` | boolean | — | `true` for outstanding work, `false` for work already done |
| `sort` | string | `newest` | `newest`, `oldest` or `due_date` |
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
    "schema_snapshot": [
      { "id": "field-id-1", "name": "Hours", "type": "number" },
      { "id": "field-id-2", "name": "Summary", "type": "text" }
    ],
    "time_spent": 90,
    "created_at": "...",
    "updated_at": "..."
  }
]
```

`schema_snapshot` is the schema as it stood when the entry was written, so a client can
render a `link` value as a link rather than showing the target's bare id.

AI Declaration: The preceding document was reviewed and edited with: Qoder, Claude Opus 5
