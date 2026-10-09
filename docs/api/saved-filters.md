# Saved filters

A **saved filter** is a named combination of the Entries page's search, project, status, tag and structured
conditions, stored so it can be put back in one click (US-2.12). They are per person: another account cannot see,
overwrite or delete yours, and a request for one that is not yours reads as "not found".

All three endpoints need `Authorization: Bearer <token>`.

## The criteria

`criteria` holds whatever the Entries page can restore. Every key is optional and unknown keys are refused (`422`).

| Key | Type | Meaning |
|---|---|---|
| `q` | string, up to 255 | The keyword. Surrounding space is trimmed; an empty one is dropped. |
| `project_id` | UUID | Narrow to one project. Must be a project the caller owns, otherwise `404 Project not found`, so a filter cannot be used to probe for other people's project ids. |
| `tag` | string | Narrow to one tag. |
| `todo` | boolean | `true` for outstanding work, `false` for finished. |
| `status` | string, up to 40 | One of the project's own statuses. |
| `sort` | `newest`, `oldest`, `due_date` or `relevance` | Default `newest`. |
| `conditions` | up to 10 objects | Structured conditions over custom fields (see [Entries](entries.md)). Capped so a saved filter cannot build an arbitrarily expensive query. |
| `match` | `all` or `any` | Whether every condition must hold or any one is enough. Default `all`. |

## Endpoints

### `GET /saved-filters`

The caller's filters, most recently saved first (then by name).

```json
[
  {
    "id": "3f6c2e7a-0f64-4d0a-b1a5-0b6b6a3e9d11",
    "name": "My bugs",
    "criteria": { "q": "bug", "todo": true, "sort": "due_date", "conditions": [], "match": "all" },
    "created_at": "2026-10-01T09:00:00Z",
    "updated_at": "2026-10-03T14:12:00Z"
  }
]
```

---

### `POST /saved-filters`

Saves a filter under a name.

```json
{ "name": "My bugs", "criteria": { "q": "bug", "todo": true } }
```

| Status | Meaning |
|---|---|
| `201` | A new filter was created. |
| `200` | The name was already in use, so **that filter was replaced** with the new criteria. |
| `404` | `criteria.project_id` is not one of the caller's projects. |
| `422` | The name is blank or over 100 characters, or the criteria are invalid. |

Re-using a name overwrites instead of failing: saving "My bugs" a second time is an update to that saved view, and
rejecting it would leave the person deleting the old one first. Names are unique per person.

---

### `DELETE /saved-filters/{filter_id}`

Deletes one. `204 No Content`; `404 Saved filter not found` if it does not exist or is not the caller's.

## Related

- A dashboard panel can show a saved filter (`type: "saved_filter"`); see
  [Dashboard and activities](dashboard-and-activities.md). If the filter has since been deleted the panel simply
  fails to resolve.
- Why criteria are stored as JSON and names overwrite: DB-40 in
  [Decisions: data and backend](../decisions/data-and-backend.md).

AI Declaration: Written with Claude Code (Sonnet 5.5) from `app/routers/saved_filters.py` and
`app/schemas.py`, 2026-10-09.
