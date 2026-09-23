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
knowing the fields in advance (US-2.10). Number fields are totalled, averaged
and bounded; every other field is grouped by its distinct values and counted.

Field definitions are read from **each entry's own schema snapshot**, not the
project's current schema. Since a format change leaves past entries exactly as
they were written, this matters more than it used to:

- **Values recorded under an earlier version of a field still count.** A figure
  recorded back when the field was text is still a figure, and dropping it from
  the total would report less work than was done. `from_earlier_formats` says
  how many of the counted values came from a version whose type differs from
  the field's current one, so a total that looks surprising is explained rather
  than mysterious.
- **Fields the project no longer asks for are still reported**, marked
  `retired: true`. The work they recorded happened; a total that quietly
  dropped it would be wrong about the project rather than merely incomplete.
- **Tags and checklists are grouped one item at a time.** Grouping by the whole
  list would produce one group per unique combination, which answers nothing;
  "what have I been tagging?" is the question a tag exists to answer.

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
      "minimum": 0.5,
      "maximum": 9,
      "groups": [],
      "from_earlier_formats": 5,
      "retired": false
    },
    {
      "field_id": "status",
      "name": "Status",
      "type": "dropdown",
      "count": 42,
      "total": null,
      "average": null,
      "minimum": null,
      "maximum": null,
      "groups": [
        { "value": "Done", "count": 30 },
        { "value": "Blocked", "count": 12 }
      ],
      "from_earlier_formats": 0,
      "retired": false
    }
  ]
}
```

| Field | Type | Description |
|---|---|---|
| `count` | integer | Entries in which this field had a value |
| `total`, `average`, `minimum`, `maximum` | number \| null | Present for `number` and `computed` fields; `null` for every other type |
| `groups` | list | For every non-numeric field: each distinct value with its count, **in the order first encountered** (not sorted). Empty for numeric fields |
| `from_earlier_formats` | integer | How many counted values were written under a version of this field whose type differs from its current one |
| `retired` | boolean | `true` once the field has left the live schema. Its figures are still reported; it is simply no longer being collected |

Every field in the current schema is reported, including one no entry has
filled in yet (`count: 0`, empty `groups`). The response does not sort or
filter; that is left to the caller, because "most common first" and "hide the
free-text noise" are presentation decisions.

**In the app:** the sidebar's **Statistics** view. Choosing a project shows
every field's figures immediately. The app sorts groups largest-first and
draws bars only for `dropdown` and `tags` fields — a free-text field is
reported as a count, since forty bars of one is not a breakdown.

!!! note "Calculations are totalled like numbers"
    A `computed` field holds a figure, so it is summed, averaged and bounded
    exactly as a `number` field is. It used to be grouped as though its results
    were categories, which made "total this calculation" — the obvious question
    to ask of one — unanswerable.

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

## Entries over a week or a term

```
GET /statistics/activity?bucket=week&project_id=…&start=…&end=…
```

Entries and time logged per day, week or month. The brief asks for "entries
written over a week or a term", which is a series rather than a total: a term's
work is a shape, and one number cannot show whether it was steady or all in the
last fortnight.

| Parameter | Default | Meaning |
|---|---|---|
| `bucket` | `week` | `day`, `week` or `month` |
| `project_id` | — | Narrow to one project. Omit for the whole logbook |
| `start`, `end` | the first and last entry | ISO dates bounding the series |

**Response:** `200 OK`

```json
{
  "bucket": "week",
  "start": "2026-03-02",
  "end": "2026-03-16",
  "points": [
    { "period": "2026-03-02", "entries": 2, "time_spent": 45 },
    { "period": "2026-03-09", "entries": 0, "time_spent": 0 },
    { "period": "2026-03-16", "entries": 1, "time_spent": 0 }
  ]
}
```

Weeks are ISO weeks labelled by the Monday that starts them, so a period reads
as a date somebody can find in a calendar rather than as `2026-W10`.

**Empty periods are included.** The series walks the calendar rather than the
data, because a fortnight of silence that is simply absent from the response
reads as no gap at all.

`time_spent` is in minutes, matching every other duration in the API.

**Errors:** `404 Not Found` — `project_id` names a project the caller does not
own.

---

## Export statistics as CSV

```
GET /statistics/export.csv
GET /statistics/projects/{project_id}/export.csv?bucket=week
```

The figures as a spreadsheet, because the record belongs to its owner and that
includes what the record adds up to.

The logbook-wide file holds two tables separated by a blank row: the totals,
then a row per project. The per-project file holds the same three things the
statistics page shows, in the order it shows them — the project's totals, every
field (with its groups), and its activity series.

Durations appear twice: once formatted as the app shows them (`3h 20m`) and
once as raw minutes, so the file and the screen can be read against each other
without arithmetic.

**Response:** `200 OK`, `text/csv`, with a `Content-Disposition` filename.

**Errors:** `404 Not Found` — no such project, or not one the caller owns.

---

## Notes for integrators

The totals endpoint is aggregated in SQL and issues three queries regardless
of how large the logbook grows — per-project aggregates, the overall
aggregate, and the distinct days for the streaks — so it is safe to poll for a
dashboard. The field statistics, timeline and activity endpoints read entries
for one project (or, for activity with no `project_id`, the whole logbook) and
are proportional to that size.

Both CSV exports are built by calling the JSON endpoints above and formatting
the result, so a figure can never differ between the file and the API.

AI Declaration: The preceding document was reviewed and edited with: Claude Opus 5
