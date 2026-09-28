# Statistics

Aggregate activity figures for the authenticated user's logbook, the saved arrangement of their Statistics page, and the figures they have defined for themselves on it. Requires authentication. Only the caller's own projects and entries are counted.

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

## Get weekly activity

```
GET /statistics/activity?weeks=12
```

Returns the caller's entries grouped by week for the last `weeks` weeks, defaulting to 12. Only the caller's own projects are counted.

Weeks run Monday to Sunday and the window always ends with the week containing today, so `weeks=1` is the current week rather than a sliding seven days. Weeks with nothing logged are returned with zero counts, so a chart of the series has no gaps.

**Response:** `200 OK`

```json
{
  "weeks": [
    { "week_start": "2026-09-07", "entries": 0, "time_spent": 0 },
    { "week_start": "2026-09-14", "entries": 10, "time_spent": 240 },
    { "week_start": "2026-09-21", "entries": 6, "time_spent": 195 }
  ],
  "busiest_weekday": "Tuesday"
}
```

### Fields

| Field | Type | Description |
|---|---|---|
| `weeks` | array | One object per week, oldest first: `week_start` (the Monday, as an ISO date), `entries` and `time_spent` (minutes) |
| `busiest_weekday` | string \| null | The weekday with the most entries in the window, or `null` when nothing was logged. Ties go to the earlier weekday |

`busiest_weekday` covers the same window as `weeks`, so it agrees with the chart beside it rather than describing all-time habits.

**Errors:** `422 Unprocessable Entity` when `weeks` is outside 1–52 — `?weeks=0` and `?weeks=53` are both rejected.

!!! warning "Timezone"
    Days are split with `func.date(Entry.created_at)` — the database's timezone, not the user's — exactly as `active_days` is above, so the same late-night-entry caveat applies to week boundaries and to `busiest_weekday`.

## Get the Statistics page layout

```
GET /statistics/layout
```

Returns the caller's saved arrangement of the Statistics page panels. One arrangement is stored per account and follows it across devices. Someone who has never customised the page has nothing saved and gets the default:

**Response:** `200 OK`

```json
[
  { "id": "cards", "visible": true },
  { "id": "time", "visible": true },
  { "id": "activity", "visible": true },
  { "id": "custom", "visible": true },
  { "id": "fields", "visible": true },
  { "id": "trend", "visible": false }
]
```

The order of the list is the order the panels render in. `trend` — the field-over-time chart — is hidden by default because it needs a project and a field chosen before it can say anything.

| `id` | Panel |
|---|---|
| `cards` | The headline numbers |
| `time` | Where your time went |
| `activity` | Your activity |
| `custom` | My stats |
| `fields` | Look inside a project |
| `trend` | A field over time |

## Save the Statistics page layout

```
PUT /statistics/layout
```

Saves the caller's arrangement and echoes it back. The body is the same shape `GET /statistics/layout` returns, in the order the panels should render. Every panel must appear exactly once.

**Request body:**

```json
[
  { "id": "activity", "visible": true },
  { "id": "cards", "visible": true },
  { "id": "time", "visible": false },
  { "id": "custom", "visible": true },
  { "id": "fields", "visible": true },
  { "id": "trend", "visible": false }
]
```

**Response:** `200 OK` — the saved arrangement, in the same shape as the GET above.

**Errors:**

| Status | Meaning |
|---|---|
| `400 Bad Request` | An unknown panel id, a panel listed twice, or a `visible` that isn't true or false |

The 400 detail names the panel and says what to do, rather than reporting a type error about JSON the caller never wrote:

```json
{ "detail": "'weather' is not a Statistics panel. The panels are: activity, cards, custom, fields, time, trend." }
```

## Saved statistics

The endpoints below manage the figures a user defines for themselves in the page's "My stats" panel — a named formula over one project's entries, such as "Average hours". A formula is written with fields by name (`avg({Hours})`) and stored canonicalised with fields by id, so renaming a field never breaks a saved statistic; every response shows it with fields by name again, ready to edit and send back.

All of them answer only for the caller's own projects: a project or statistic belonging to another account is indistinguishable from one that does not exist (`404`).

### The formula grammar

A formula may contain numbers, `+ - * /`, unary minus, parentheses, and calls to `sum`, `avg`, `min`, `max` and `count`:

- Each of `sum`/`avg`/`min`/`max` takes exactly one field, written in braces: `sum({Hours})`. Only number and computed fields may be read — arithmetic over a dropdown label has no meaning.
- `count()` takes nothing between its brackets and counts the entries.
- Fields resolve by name, case-insensitively, or by id.

Formulas are parsed with Python's `ast` against an allowlist and are never evaluated with `eval` — the same approach computed fields use. Anything outside the grammar, or a field the project does not have, is rejected with a `400` whose detail is a sentence meant to be shown as-is:

```json
{ "detail": "There's no field called 'Hurs' in Lab practicals. Did you mean 'Hours'?" }
```

Values are read per entry against each entry's own `schema_snapshot`, exactly as the field statistics endpoints do, so an entry recorded before a field existed — or while it held a different type — is excluded rather than misread. A formula that cannot produce a number *yet* is not an error: `avg({Hours})` over a project with no matching entries returns `"value": null` with a note saying why.

## List saved statistics

```
GET /statistics/custom
```

Returns the caller's saved statistics, newest first, each with the number it works out to at that moment — a statistic is evaluated fresh on every call, against the project's current entries.

**Response:** `200 OK`

```json
[
  {
    "id": "...",
    "project_id": "...",
    "project_name": "Lab practicals",
    "name": "Average hours",
    "expression": "avg({Hours})",
    "description": "Average of Hours",
    "value": 2.5,
    "entries_used": 128,
    "note": null,
    "created_at": "2026-09-01T10:00:00Z",
    "updated_at": "2026-09-01T10:00:00Z"
  }
]
```

### Fields

| Field | Type | Description |
|---|---|---|
| `expression` | string | The formula with fields written by name |
| `description` | string | "Average of Hours" for the shapes the page's sentence builder produces; the formula itself for anything written by hand |
| `value` | number \| null | The number the formula works out to, or `null` when it cannot yet |
| `entries_used` | integer | How many entries the formula drew on |
| `note` | string \| null | Why `value` is `null`, in a sentence — no matching entries yet, a division by zero, or the reason a schema change has left the formula unreadable |

A formula whose field was removed or retyped after saving is **not** dropped from the list: it is returned with `value: null` and the reason in `note`, so its owner can edit or delete it rather than the page failing.

## Preview a statistic

```
POST /statistics/custom/preview
```

Works a formula out against a project's entries without saving anything. The Statistics page calls this live while a formula is being written.

**Request body:**

```json
{ "project_id": "...", "expression": "avg({Hours})" }
```

**Response:** `200 OK`

```json
{ "value": 2.5, "entries_used": 128, "note": null }
```

**Errors:**

| Status | Meaning |
|---|---|
| `400 Bad Request` | The formula cannot be used against this project's fields — an unknown field, a wrong field type, or something outside the grammar. The detail is the sentence to show |
| `404 Not Found` | No such project of the caller's |

## Save a statistic

```
POST /statistics/custom
```

**Request body:**

```json
{ "project_id": "...", "name": "Average hours", "expression": "avg({Hours})" }
```

`name` is at most 100 characters once trimmed and `expression` at most 500. The formula is checked — and canonicalised to field ids for storage — exactly as the preview endpoint checks it, so what previewed successfully will save.

**Response:** `201 Created` — the saved statistic, in the shape `GET /statistics/custom` returns, with its current value.

**Errors:** as for preview, plus `422 Unprocessable Entity` for a blank or over-long name.

## Edit a saved statistic

```
PUT /statistics/custom/{statistic_id}
```

**Request body** — every field is optional:

```json
{ "name": "Average hours, honestly", "expression": "avg({Hours}) - 0.5", "project_id": "..." }
```

The formula is only re-checked when it (or the project) changes: renaming a statistic keeps working for someone whose project fields have moved on since the formula was saved.

**Response:** `200 OK` — the updated statistic with its current value.

**Errors:** `404 Not Found` when the statistic or the project is not the caller's; `400` as for preview when a changed formula cannot be used.

## Delete a saved statistic

```
DELETE /statistics/custom/{statistic_id}
```

**Response:** `204 No Content`

**Errors:** `404 Not Found` — deleting a statistic belonging to another account is indistinguishable from deleting one that does not exist.

## Notes for integrators

The activity figures are aggregated in SQL: `GET /statistics` issues two queries regardless of how large the logbook grows, and `GET /statistics/activity` groups entries by day in the database before folding the days into weeks — work proportionate to the weeks requested, not the entries logged. Both are safe to poll for a dashboard. `/statistics/layout` is one row per user, read and written whole.

Saved statistics are evaluated in Python per request: a list call reads each project's entries once, no matter how many statistics read that project, and every formula is a single pass over those entries. Deleting a project or the account takes its saved statistics with it.

AI Declaration: The preceding document was reviewed and edited with: Claude Opus 5. The weekly activity, layout and saved statistics sections were added with: Qoder.
