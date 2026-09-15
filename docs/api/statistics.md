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

## Notes for integrators

Both figures are aggregated in SQL. The endpoint issues two queries regardless of how large the logbook grows, so it is safe to poll for a dashboard.

AI Declaration: The preceding document was reviewed and edited with: Claude Opus 5
