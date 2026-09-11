# Export and import

Take your logbook out of Chronicles and bring it back in. All endpoints require authentication and operate only on the caller's own data.

## Export the whole logbook

```
GET /export
```

Returns every project you own — archived ones included — with its schema and all of its entries, as a single JSON document.

**Response:** `200 OK`

```json
{
  "format": "chronicles-export",
  "version": 1,
  "exported_at": "2026-09-11T20:00:00Z",
  "projects": [
    {
      "id": "6d0eba8a-bbe7-443c-9620-f22d390f5116",
      "name": "Field Notes",
      "description": "Daily observations",
      "archived": false,
      "entry_schema": [
        { "id": "topic", "name": "Topic", "type": "text" },
        { "id": "pages", "name": "Pages", "type": "number" }
      ],
      "created_at": "2026-01-04T08:12:00Z",
      "entries": [
        {
          "id": "b1f0...",
          "data": { "topic": "Shading", "pages": 12 },
          "time_spent": 45,
          "created_at": "2026-03-02T09:00:00Z"
        }
      ]
    }
  ]
}
```

| Field | Purpose |
|---|---|
| `format` | Identifies the file as a Chronicles export. Import rejects anything else |
| `version` | Format version. Import refuses a file from a newer version rather than guessing |
| `exported_at` | When the export was taken. Informational |

## Export one project as CSV

```
GET /projects/{project_id}/export.csv
```

A flat CSV of one project's entries, for opening in a spreadsheet.

**Response:** `200 OK`, `text/csv`, as a file download.

```csv
Captured at,Topic,Pages,Time spent (minutes)
2026-03-02T09:00:00+00:00,Shading,12,45
2026-04-15T09:00:00+00:00,Lighting,8,45
```

Columns are the project's schema field **names**, between the capture time and the duration.

!!! warning "CSV is lossy and cannot be imported"
    A CSV has no way to carry a project's schema, and every project defines its own fields, so there is no single set of columns that covers a logbook. Use the JSON export for anything you intend to restore.

**Errors:** `404` if the project does not exist or is not yours.

## Import

```
POST /import
```

**Body:** a document previously returned by `GET /export`.

**Response:** `200 OK`

```json
{
  "projects_created": 2,
  "projects_reused": 1,
  "entries_created": 128,
  "entries_skipped": 3,
  "issues": [
    "Entry from 2026-03-02 in 'Field Notes': Unknown field: topic"
  ]
}
```

**Errors:** `422` if the file is not a Chronicles export, or was produced by a newer version of the format.

### What import does

Import is **additive**. Nothing already stored is deleted, and no existing project's name, description or schema is modified.

Each project in the file is resolved one of three ways:

| Situation | Result |
|---|---|
| You already own a project with that id | Reused as it currently stands. Its name, description and schema are left alone; only entries it does not already have are added |
| The id is not in use | The project is recreated with that id, preserving its name, description, archived state, schema and creation date |
| The id belongs to another user | A new project is created under a fresh id, and the file's entries are remapped onto it |

The middle row is the case that matters most: restoring a project you lost brings it back complete, schema included.

The first row is deliberate. If you import a month-old backup into a project you still have, reverting its schema to the older version would destroy work you have done since. The entries come back; the project's current shape stays.

### Entries that cannot be restored

An entry is validated against the schema of the project it lands in. When a project is reused and its schema has changed since the export, older entries may no longer fit.

Those entries are **not** imported, and each one is named in `issues` with its date, project and the reason. They are reported rather than dropped silently, so you know exactly what did not come back.

### Idempotency

**Re-importing your own export is a no-op.** Every project and entry is found by the id it carries, so nothing is duplicated no matter how many times you run it.

!!! note "Importing someone else's export repeatedly does duplicate"
    Their ids belong to their account, so each import creates copies under fresh ids, and nothing records which exported id a copy came from. Importing the same foreign file twice therefore produces two sets.

    Reconciling this would require storing provenance on each row. It is a known limitation rather than an oversight.

AI Declaration: The preceding document was reviewed and edited with: Claude Opus 5
