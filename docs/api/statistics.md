# Statistics

Aggregate activity figures for the authenticated user's logbook. Requires authentication. Only the caller's own projects and entries are counted.

## Get statistics

```
GET /statistics
```

Returns totals for the whole logbook plus a per-project breakdown, ordered newest project first.

**Response:** `200 OK`

```json
{
  "totals": {
    "projects": 4,
    "active_projects": 3,
    "archived_projects": 1,
    "entries": 128,
    "time_spent": 4320,
    "active_days": 47,
    "current_streak": 6,
    "longest_streak": 19,
    "first_entry_at": "2026-01-04T08:12:00Z",
    "last_entry_at": "2026-09-10T17:40:00Z"
  },
  "projects": [
    {
      "project_id": "...",
      "name": "Field Notes",
      "archived": false,
      "entries": 52,
      "time_spent": 1980,
      "active_days": 21,
      "current_streak": 6,
      "longest_streak": 12,
      "first_entry_at": "2026-02-11T07:55:00Z",
      "last_entry_at": "2026-09-10T17:40:00Z"
    }
  ]
}
```

### Fields

| Field | Type | Description |
|---|---|---|
| `projects` | integer | Total projects, active and archived |
| `active_projects` | integer | Projects not archived |
| `archived_projects` | integer | Projects archived |
| `entries` | integer | Total entries logged |
| `time_spent` | integer | Sum of `time_spent` across entries, in minutes. Entries with no recorded duration contribute nothing |
| `active_days` | integer | Distinct calendar days with at least one entry |
| `current_streak` | integer | Consecutive days with an entry, ending today or yesterday. `0` once a day has been missed |
| `longest_streak` | integer | The longest such run ever recorded |
| `first_entry_at` | datetime \| null | Earliest entry's `created_at`, or `null` when there are no entries |
| `last_entry_at` | datetime \| null | Latest entry's `created_at`, or `null` when there are no entries |

The per-project objects carry the same activity fields, plus `project_id`, `name` and `archived`.

!!! note "active_days does not sum across projects"
    A day on which you logged entries against two different projects counts as **one** active day in `totals`, and as one active day in *each* project's breakdown. Adding up the per-project figures will therefore overcount.

!!! note "A streak that reached yesterday is still alive"
    `current_streak` counts a run that ends today **or yesterday**. Not having written yet today is not the same as having stopped, and a streak that reset to `0` at midnight would punish everyone who logs in the evening. A run whose last day is earlier than yesterday has been broken and reads as `0`; `longest_streak` keeps what it reached.

    The overall streak is computed over the union of every project's days, so writing in project A yesterday and project B today is a streak of 2 in `totals` even though each project alone shows 1.

!!! warning "Timezone"
    `active_days` groups entries by calendar date using the database's timezone, not the user's. A late-night entry may land on the neighbouring day for users far from the server's timezone. Supporting per-user timezones would require storing an offset on the user record.

A project that has never been used appears in the breakdown with zero counts and `null` timestamps, rather than being omitted.

---

## Total and group by any field

```
GET /statistics/projects/{project_id}/fields
```

Statistics for every field the project's owner has defined, without the API
knowing the fields in advance (US-2.10). Number fields are totalled and
averaged; every other field is grouped by its distinct values and counted.

Field definitions are read from **each entry's own schema snapshot**, not the
project's current schema, so entries written before a field changed type are
still counted under the type they were written with.

**Response:** `200 OK`

```json
{
  "project_id": "...",
  "schema_version": 3,
  "fields": [
    {
      "field_id": "hours",
      "name": "Hours",
      "type": "number",
      "count": 42,
      "total": 156.5,
      "average": 3.73,
      "groups": []
    },
    {
      "field_id": "status",
      "name": "Status",
      "type": "dropdown",
      "count": 42,
      "total": null,
      "average": null,
      "groups": [
        { "value": "Done", "count": 30 },
        { "value": "Blocked", "count": 12 }
      ]
    }
  ]
}
```

| Field | Type | Description |
|---|---|---|
| `count` | integer | Entries in which this field had a value |
| `total`, `average` | number \| null | Present for `number` fields; `null` for every other type |
| `groups` | list | For every non-number field: each distinct value with its count, **in the order first encountered** (not sorted). Empty for `number` fields |

Every field in the current schema is reported, including one no entry has
filled in yet (`count: 0`, empty `groups`). The response does not sort or
filter; that is left to the caller, because "most common first" and "hide the
free-text noise" are presentation decisions.

**In the app:** the sidebar's **Statistics** view. Choosing a project shows
every field's figures immediately. The app sorts groups largest-first and
draws bars only for `dropdown` and `tags` fields — a free-text field is
reported as a count, since forty bars of one is not a breakdown.

!!! note "Calculation fields are grouped, not totalled"
    A `computed` field's value is derived from number fields, but the API
    currently treats it as categorical: its distinct results are grouped and
    counted rather than summed. Totalling calculations is a candidate for
    Milestone 3; until then, total the number fields it is built from.

**Errors:** `404 Not Found` — no such project, or not one the caller owns.

---

## Plot a field over time

```
GET /statistics/projects/{project_id}/fields/{field_id}/timeline?start=…&end=…
```

Every value recorded for one field, in chronological order, for charting
(US-2.11). `start` and `end` are optional ISO 8601 datetimes.

**Response:** `200 OK`

```json
{
  "project_id": "...",
  "field_id": "hours",
  "field_name": "Hours",
  "field_type": "number",
  "start": "2026-05-01T00:00:00+00:00",
  "end": "2026-05-31T23:59:59+00:00",
  "points": [
    { "entry_id": "...", "created_at": "2026-05-05T09:00:00+00:00", "value": 5, "schema_version": 1 },
    { "entry_id": "...", "created_at": "2026-05-10T09:00:00+00:00", "value": 8, "schema_version": 2 }
  ]
}
```

Each point carries the `schema_version` it was written under, so a chart can
mark where the format changed rather than silently mixing two definitions of
the same field.

**Errors:** `404 Not Found` — no such project, or the field does not exist in
any version of its schema.

---

## Notes for integrators

The totals endpoint is aggregated in SQL and issues three queries regardless
of how large the logbook grows — per-project aggregates, the overall
aggregate, and the distinct days for the streaks — so it is safe to poll for a
dashboard. The field statistics and timeline endpoints read entries for one
project and are proportional to that project's size.

AI Declaration: The preceding document was reviewed and edited with: Claude Opus 5
