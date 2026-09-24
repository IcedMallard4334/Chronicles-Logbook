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

Returns entries across all projects owned by the authenticated user, ordered newest first by default.

**Query parameters:**

| Parameter | Type | Default | Description |
|---|---|---|---|
| `q` | string | — | Keyword matched against project name and entry field values |
| `project_id` | UUID | — | Filter to a single project. Required when `conditions` is used |
| `tag` | string | — | Only entries whose tag-type fields contain this tag |
| `todo` | boolean | — | Narrow to outstanding (`true`) or completed (`false`) work |
| `conditions` | string (JSON) | — | Structured filters over the project's own custom fields — see below |
| `match` | `all` \| `any` | `all` | How `conditions` combine: AND or OR |
| `sort` | `newest` \| `oldest` \| `due_date` \| `relevance` | `newest` | Ordering. `relevance` only means something when `q` and/or `conditions` narrow the results |
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

### Structured search over custom fields (US-3.11)

`conditions` is a JSON-encoded array of `{ "field_id", "operator", "value", "value2" }`
objects, sent as a query parameter because a `GET` request has no body:

```
GET /entries?project_id=...&match=any&conditions=%5B%7B%22field_id%22%3A%22f-status%22%2C%22operator%22%3A%22equals%22%2C%22value%22%3A%22Open%22%7D%5D
```

which decodes to:

```json
[{ "field_id": "f-status", "operator": "equals", "value": "Open" }]
```

Which operators apply depends on the field's type. `value2` is only read by
`between`.

| Field type | Operators | Notes |
|---|---|---|
| `text` | `contains`, `equals` | Case-insensitive |
| `number`, `computed` | `equals`, `gt`, `gte`, `lt`, `lte`, `between` | |
| `date` | `on`, `before`, `after`, `between` | |
| `dropdown` | `equals`, `in` | `in` takes a list of option strings as `value` |
| `tags` | `has`, `has_any`, `has_all` | `has` takes one tag; the others take a list |
| `checklist` | `contains`, `complete` | `contains` searches item text; `complete: true` asks "is everything on this checklist ticked off" (an empty checklist has nothing to be complete, so it never matches), `complete: false` asks "is something still outstanding" |
| `link`, `project_reference` | `is_set`, `is_empty`, `equals` | `equals` compares against another entry's/project's id |

Because a field id only means something within the schema that defines it,
`conditions` requires `project_id` — a `422` explains this if it's missing.
Requesting a `field_id` the project's *current* schema doesn't have, or an
operator that field's type doesn't support, is also a `422` with a plain
description of what was wrong, not a generic validation error.

**Which entries can answer a condition.** Each entry is evaluated against its
*own* `schema_snapshot` — the schema its project had when the entry was
written, the same source [statistics](statistics.md) reads historical values
from — not against the project's current schema. An entry from before a
field existed, or that never got the value backfilled onto its own snapshot,
simply cannot answer a condition on that field: it is excluded, never an
error and never a guess.

### Relevance ranking

`sort=relevance` orders results by, in order: how many of the (OR'd)
`conditions` an entry satisfies, then how many times `q` occurs across its
field values and project name, then most recent first as a final tiebreak.
It's a deliberately simple, explainable heuristic — not a machine-learned
ranking — chosen so "why did this result come first" always has a plain
answer. `match=all` conditions don't affect the first term (everything that
survives already satisfied all of them), so ranking among an AND'd result set
falls straight through to the keyword and recency terms.

AI Declaration: The preceding document was reviewed and edited with: Qoder, Claude Opus 5; this section (Structured search over custom fields / Relevance ranking) was added with Claude Code, Claude Sonnet 5, for code + docs.
