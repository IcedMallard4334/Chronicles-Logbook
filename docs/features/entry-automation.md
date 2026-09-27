# Entry Rules, Recurrence & Reminders

**US-3.12**: *As an owner, I want the logbook to apply rules automatically and remind me of what's due, so that I don't have to do the routine bookkeeping myself.*

| Acceptance criterion | How it's met |
|---|---|
| Owner can define a rule that runs automatically when a matching entry is captured (e.g. auto-tag, auto-fill a field) | [Rules](#rules): conditions + actions, run on every new entry |
| Owner can mark an entry as recurring, and the logbook creates the next occurrence automatically | [Recurrence](#recurrence): daily / weekly / monthly, created when due |
| Reminders are raised for entries or todos approaching or past their due date | [Reminders](#reminders): one endpoint listing overdue, due-today and upcoming items |

Code: `backend/app/automation.py` (logic), `backend/app/routers/automation.py` (endpoints), `backend/migrations/011_entry_automation.sql`. Tests: `backend/tests/test_automation.py`.

## Rules

A rule belongs to a project and has **conditions** (when to act) and **actions** (what to do).

**Conditions** use exactly the same format and operators as structured search (US-3.11), so anything you can search for, you can write a rule for. `match` is `all` (every condition) or `any` (at least one). A rule with no conditions applies to every new entry.

**Actions:**

| Action | Does | Example |
|---|---|---|
| `add_tags` | Adds tags to a tags field, keeping the author's own tags and skipping duplicates | Tag every Bug entry `triage` |
| `set_field` | Fills a text, number, date or dropdown field, **only if the author left it blank** (unless `overwrite: true`) | Default Severity to `High` for bugs |
| `mark_todo` | Marks the entry as a to-do, optionally due `due_in_days` after capture | Bugs are due in 3 days |

```json
POST /projects/{project_id}/rules
{
  "name": "Triage new bugs",
  "match": "all",
  "conditions": [{ "field_id": "f-kind", "operator": "equals", "value": "Bug" }],
  "actions": [
    { "type": "add_tags", "field_id": "f-tags", "tags": ["triage"] },
    { "type": "set_field", "field_id": "f-severity", "value": "High" },
    { "type": "mark_todo", "due_in_days": 3 }
  ]
}
```

The response to creating an entry includes `applied_rules`: the rules that changed it. The UI can then show "Tagged by *Triage new bugs*".

**Design decisions:**

- **Rules run only when an entry is created, never when it's edited.** Otherwise a tag the author deliberately removed would come straight back on the next save.
- **Rules run before validation.** So a rule can fill in a required field the author left blank.
- **Conditions are checked against what the author entered, not what other rules produced.** Rules never trigger each other, and the outcome doesn't depend on rule order. The one exception: if two rules fill the same blank field, the older rule wins.
- **Author's choices beat rules.** A due date the author set is never replaced by `mark_todo`.
- **Rules are checked when saved, and again when they run.** An invalid rule (unknown field, wrong operator, dropdown option that doesn't exist) is refused with a 422 explaining why. If the schema changes afterwards (a field is removed or an option is renamed), the affected action is skipped rather than blocking the entry.
- **Permissions:** only the project **owner** can create, edit or delete rules, like the schema. Members can **read** them, so they can see why their entry was tagged. Rules apply to entries anyone captures in the project.
- **Limits:** 20 rules per project, 10 conditions and 5 actions per rule. Unknown keys in the request body are rejected.

| Method | Path | Who |
|---|---|---|
| `GET` | `/projects/{id}/rules` | owner, members |
| `POST` | `/projects/{id}/rules` | owner |
| `GET` | `/projects/{id}/rules/{rule_id}` | owner, members |
| `PUT` | `/projects/{id}/rules/{rule_id}` | owner (full replace, including `enabled`) |
| `DELETE` | `/projects/{id}/rules/{rule_id}` | owner (entries it already changed keep those changes) |

## Recurrence

Any entry can be made to repeat:

```json
PUT /projects/{project_id}/entries/{entry_id}/recurrence
{ "frequency": "weekly", "interval": 1, "starts_on": "2026-10-01", "ends_on": "2026-12-31" }
```

- `frequency`: `daily`, `weekly` or `monthly`; `interval`: every N periods (1–365).
- `starts_on` is the date the original entry stands for. It defaults to the entry's due date, or today. The first new occurrence is one period later.
- Monthly dates are always counted from `starts_on`, so an entry on the 31st lands on 28/29 February and goes back to 31 March. It doesn't drift.

**Each occurrence copies the original entry's current title and values.** Editing the original changes future occurrences but not ones already created. Checklists start unticked. If the original is a to-do or has a due date, each occurrence is due on its own date.

**When occurrences are created.** Azure App Service has no built-in scheduler that could create entries at midnight. So occurrences are created the next time anyone opens the app: every call to `GET /reminders`, or `GET /projects/{id}/recurrences`, first creates whatever has come due. Missed occurrences are created too, so a skipped day in a daily log shows up as outstanding rather than vanishing. There's a limit of 31 per call.

**Why duplicates can't happen:** each occurrence is recorded in `recurrence_occurrences` with a unique (recurrence, date) constraint. If two requests (or two worker processes) create the same occurrence at once, one hits the constraint and simply moves on. Deleting an occurrence's entry keeps its record, so it isn't recreated.

| Method | Path | Notes |
|---|---|---|
| `PUT` | `/projects/{id}/entries/{entry_id}/recurrence` | Create (201) or replace (200). Owner, or the entry's author |
| `GET` | `/projects/{id}/entries/{entry_id}/recurrence` | 404 if the entry doesn't repeat |
| `DELETE` | `/projects/{id}/entries/{entry_id}/recurrence` | Stops repeating; existing occurrences are kept |
| `GET` | `/projects/{id}/recurrences` | All repeating entries in a project |

## Reminders

```
GET /reminders?within_days=7&today=2026-09-27
```

Returns to-do entries and open tasks with a due date that is **overdue, due today, or due within `within_days`** (0–60, default 7). It covers every unarchived project the user owns or is a member of. Overdue items come first.

```json
{
  "today": "2026-09-27", "within_days": 7,
  "overdue_count": 1, "due_today_count": 1, "upcoming_count": 2,
  "occurrences_created": 0,
  "items": [
    { "kind": "entry", "id": "…", "project_id": "…", "project_name": "Thesis",
      "title": "Submit chapter 2", "due_date": "2026-09-25", "status": "overdue", "days_until": -2 }
  ]
}
```

- **`today`** is optional. The frontend should send the device's local date: the server runs on UTC, so between 00:00 and 02:00 in South Africa it would otherwise think it's still yesterday. It must be within a day of the server's date; anything further out is rejected, so it can't be used to fast-forward recurrences.
- An entry without a title is shown by its first text value.
- **Frontend:** call this on app load and every few minutes. Show the counts as a badge and the items as a list. It also keeps recurring entries up to date, so no other polling is needed.

## Not included (and why)

- **Email or push reminders.** Reminders are in-app only. Sending email on a schedule needs a background job, which App Service doesn't provide without extra infrastructure, such as an Azure Function on a timer calling `/reminders` for each user.
- **Rules on edit, or re-running rules over old entries.** Deliberately left out; see the design decisions above.
- **Export/import of rules and recurrences.** The export format (US-2.17) covers projects and entries only.
