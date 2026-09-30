# Dashboard and activities

## Dashboard

Each person has one dashboard: an ordered set of **panels** laid out on a grid
they choose the width of. It is what the Home page shows underneath the welcome.

### `GET /dashboard`

```json
{
  "columns": 3,
  "updated_at": "2026-09-30T18:12:00Z",
  "panels": [
    { "id": "a1", "type": "statistic", "title": null, "config": { "view": "overview" }, "w": 2, "h": 1 },
    { "id": "b2", "type": "board", "title": null, "config": { "project_id": "…", "grouping": "__status__" }, "w": 1, "h": 2 }
  ]
}
```

A first visit creates an empty dashboard three blocks wide.

### `PUT /dashboard`

Replaces the whole layout. Adding, removing, reordering and resizing are all the
same request: send the desired panel list, in order.

| Field | Rules |
|---|---|
| `panels` | List of panels (required). |
| `columns` | Optional, 2 to 6. Leave it out to keep the width already chosen. |
| panel `id` | 1 to 100 characters, unique per panel. |
| panel `type` | `statistic`, `saved_filter` or `board`; its `config` is validated for that type. |
| panel `title` | Optional, up to 100 characters. |
| panel `w` | Columns the panel spans, 1 to 6 (default 1). Clamped to `columns` when saved, so a panel is never wider than its grid. |
| panel `h` | Rows it spans, 1 to 4 (default 2). |

Invalid panel types or configs, and sizes outside those ranges, return `422`.
Panel configs are not checked against the caller's own projects here: the
endpoints that resolve a panel's data already enforce ownership, so a panel
pointing at something the caller can't see simply fails to load.

## Scheduled activities

Activities are things a person plans on the calendar. They are saved in
Chronicles only — **Google Calendar is never written to**. They appear in the
Calendar and on the Activities page.

| Method & path | Purpose |
|---|---|
| `GET /calendar/activities?start=YYYY-MM-DD&end=YYYY-MM-DD` | Activities in a range of up to 366 days, by day and start time. |
| `POST /calendar/activities` | Create one. `201`. |
| `PUT /calendar/activities/{id}` | Replace one (the whole definition, including its day). |
| `DELETE /calendar/activities/{id}` | Delete one. `204`. |

Body for create and replace:

```json
{
  "title": "Planning session",
  "description": "",
  "day": "2026-10-01",
  "all_day": false,
  "start_time": "09:00",
  "end_time": "10:00"
}
```

- `title` is required (1 to 255 characters, not blank); `description` up to 4000.
- Times are `HH:MM`, 24-hour. Unless `all_day` is true, both are required and the
  end must be after the start. An all-day activity has no times (they are cleared).
- Unknown fields are refused (`422`).
- Someone else's activity is `404` on read-modify-delete, never `403`, so ids can't
  be probed.
