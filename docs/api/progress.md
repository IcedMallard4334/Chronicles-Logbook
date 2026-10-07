# Streaks and achievements

Two small endpoint groups that recognise how someone uses Chronicles: **daily
streaks** (days in a row) and **achievements** (badges for milestones). What the
badges are, and how they are earned, is in [Achievements](../features/achievements.md).

All routes need a signed-in user, and each person only ever sees their own.

## Streaks

There are two, counted separately:

- **Login streak**: consecutive days the app was opened.
- **Activity streak**: consecutive days something was *saved*: an entry, a task, a
  project, an activity, a status change — any successful create or edit.

A streak stays alive until the end of the following day, so it isn't lost before
someone has had the chance to come back.

### `POST /streaks/activity`

```json
{ "kind": "interaction", "day": "2026-09-30" }
```

`kind` is `login` or `interaction`. `day` is the caller's **local** date. Recording
the same day twice changes nothing. A day more than one day either side of the
server's UTC date is refused with `422`, so a streak cannot be back-filled or
pre-filled.

Returns the streaks as `GET /streaks` does. The web app sends `login` when it
opens and `interaction` the first time it saves something each day; you don't
need to call this yourself unless you are building another client.

### `GET /streaks?today=YYYY-MM-DD`

```json
{
  "login":       { "current": 4, "longest": 9, "active_today": true,  "last_day": "2026-09-30" },
  "interaction": { "current": 0, "longest": 2, "active_today": false, "last_day": "2026-09-27" }
}
```

`today` is required (the caller's local date). `current` counts back from today,
or from yesterday if today hasn't happened yet.

## Achievements

### `GET /achievements`

Returns every badge with this person's progress, and awards any badge whose
target has just been reached.

```json
{
  "earned": 3,
  "total": 34,
  "by_tier":     { "bronze": { "earned": 3, "total": 11 }, "silver": { "earned": 0, "total": 13 }, "gold": {...}, "legendary": {...}, "platinum": { "earned": 0, "total": 1 } },
  "by_category": { "projects": { "name": "Projects", "earned": 1, "total": 3 }, "...": {} },
  "badges": [
    {
      "key": "first_project",
      "name": "First Chapter",
      "category": "projects",
      "category_name": "Projects",
      "tier": "bronze",
      "blurb": "Every logbook starts with a single page. You opened yours.",
      "how": "Create your first project.",
      "target": 1,
      "progress": 1,
      "earned": true,
      "earned_at": "2026-09-30T19:57:31Z",
      "is_new": true
    }
  ]
}
```

- `progress` is capped at `target`; an earned badge always reads complete, even if
  the work behind it has since been deleted.
- `is_new` is `true` from the moment a badge is earned until its celebration has
  been marked as shown.
- The **first** time anyone's badges are checked, badges they already qualify for
  are awarded quietly (`is_new: false`) so an existing account isn't greeted with
  thirty celebrations at once.

Like every other route it returns `401` without a valid bearer token.

### `POST /achievements/seen`

```json
{ "keys": ["first_project", "first_entry"] }
```

Marks these celebrations as shown. Unknown keys are ignored; an empty list, or any
extra field, is `422`. Returns `204`.

Badge and streak calls are deliberately **not** counted as activity themselves,
so checking for badges can never extend a streak or trigger another check.
