# Schema and field types

A project's `entry_schema` decides what its entries record. This page documents
the field types available, and the endpoints for changing a schema after entries
already exist.

## Field types

| Type | Value in `data` | Required on create | Extra keys |
|---|---|---|---|
| `text` (short text) | string, up to 255 characters | Yes | — |
| `long_text` (long text) | string, up to 5,000 characters | Yes | — |
| `number` | integer or float | Yes | — |
| `date` | ISO date string (`YYYY-MM-DD`) | Yes | — |
| `dropdown` | one of `options` | Yes | `options` (non-empty array of strings) |
| `project_reference` | project UUID | Never — server-derived | `linked_project_id` |
| `computed` | number or `null` | Never — server-derived | `expression` |

A field definition is `{ "id": "...", "name": "...", "type": "..." }` plus the
extra keys its type requires, and an optional `"required": false`. Field names must be unique within a schema
(case-insensitively); ids must be unique and are how values in `data` are keyed.

**Required.** Every field is `required: true` unless it says otherwise (the default, and what
every schema saved before the flag existed means). A *finished* entry must give a required field
a value; a field with `required: false` may be left out. A planned entry (to do) never has to fill
in anything. `computed` and `project_reference` fields are never asked for.

**Short and long text.** The two are the same kind of value with different room: `text` is for a
name, a place or a line (255 characters), `long_text` for notes and descriptions (5,000). A value
over the limit is refused with `Field 'Place' can hold at most 255 characters`. A value that was
stored before the limit existed, and is sent back unchanged, is not refused, so an older entry can
still be saved. Changing a field between the two keeps what was written.

### What every entry has

`title` and `time_spent` (hours and minutes in the forms) are columns of the entry, not entries in
`entry_schema`: every entry has them whatever the schema says. The app shows them as greyed-out
built-in fields at the top of the schema, and a schema edit can add fields on top but never rename,
retype or remove them. A new project made in the app starts with a long-text `Description` and a
`Date` (both `required: false`) in its `entry_schema`.

---

## Project reference

```json
{
  "id": "f-related",
  "name": "Related project",
  "type": "project_reference",
  "linked_project_id": "9d2f6c1e-4a3b-4f2e-9c8d-7e6f5a4b3c2d"
}
```

A link names its target once, **in the schema**. The value on every entry is
derived from `linked_project_id` — the same contract as a computed field, so
whatever the client sends for the field is discarded. Entries cannot disagree
with the schema about where a link points, and a link captured offline syncs
without having to re-answer a question the schema had already answered.

The target must be a project **owned by the same user**, and cannot be the
project itself. The check is a lookup against the caller's own projects, so a
link cannot be used to probe for another user's project ids.

Changing the target is a schema edit: every past entry is re-pointed at the new
target, and the change is reported as `link_changed` in the
[preview](#preview-a-schema-change) before it is applied.

!!! note "Referenced projects are not cascade-protected"
    Deleting a project does not rewrite entries that referenced it. A dangling
    reference is a value the client renders as "A project you no longer have"
    rather than an error, because refusing to delete a project until nothing
    points at it would be a worse trade.

!!! note "Schemas saved before links moved into the schema"
    `linked_project_id` is optional at the model level so schemas — and export
    files — written before links were a schema-level fact still load. Saving
    such a schema again is rejected with `422` until a target is chosen, and
    entries under the field keep whatever value they hold.

---

## Computed fields

```json
{
  "id": "f-cost",
  "name": "Cost",
  "type": "computed",
  "expression": "{f-hours} * {f-rate}"
}
```

The server evaluates `expression` on every write and stores the result in
`data`. Whatever the client sends for a computed field is **discarded**, so the
stored value can never disagree with the expression.

### Expression grammar

| Allowed | Notes |
|---|---|
| Numbers | `3`, `1.5` |
| Field references | `{field-id}` or `{field-name}` — must name a `number` or `computed` field in the same schema |
| Operators | `+` `-` `*` `/`, and unary `-` |
| Parentheses | Ordinary precedence |

Nothing else. Expressions are parsed with Python's `ast` module against an
allowlist of node types; `eval` is never used. An expression is a string a user
typed, so the only safe design is one in which very little can be expressed.

A reference may be written by id or by name, case-insensitively (a token that
matches an id wins). Whatever form an expression arrives in, it is stored
**canonicalised**: every reference rewritten to the field's id. That is what
makes renaming safe — the stored expression never contained the name, so a
rename is a label change and is never reported as `expression_changed`.

**Rejected at save time (`422`):**

- an expression that will not parse
- a reference to a field that is not in the schema
- a reference to a field that is not a `number` or `computed`
- a field referencing itself, or a cycle between computed fields

### Evaluation

A computed value is `null` when it cannot be worked out:

- a source field is empty or holds something that is not a number
- the arithmetic is impossible — division by zero yields `null`, not an error

Computed fields may read other computed fields. They are evaluated in
dependency order, worked out by topological sort, so ordering in the schema
array does not matter.

Results are rounded to six decimal places, so `0.1 + 0.2` stores as `0.3`.

!!! note "Evaluated twice, on purpose"
    The frontend has its own parser for the same grammar in `src/fieldTypes.js`,
    so a calculation settles as the entry is typed rather than only after it is
    saved. The server recomputes on write regardless, so a disagreement between
    the two is a display bug and never bad data.

---

## Editing a live schema

Changing the schema of a project that already has entries changes the
**project** — `entry_schema` and `schema_version` — and nothing else. No
existing entry is touched. Every entry keeps recording under the exact shape
(`schema_snapshot`) it was created with, permanently, until someone
individually edits that one entry and opts in to bringing it up to date (see
[Update entry](entries.md#update-entry)). Saving a schema is instant and free
of consequence to your data no matter how many entries the project has,
precisely because it doesn't reach into any of them.

That "bring up to date" migration, when someone chooses it for one entry,
follows the same two rules either way:

1. **A field the entry didn't have gets a default suited to its type:** `""`
   for text, `0` for number, the first choice for a dropdown, the link's
   target for a reference, and for a date the day that entry was captured.
   (The entry's own capture date is the only honest guess available; today's
   date would be wrong.)
2. **A value that cannot survive the new shape is retired, not deleted.** It
   moves to `entries.retired_data`, and its field definition to
   `projects.retired_schema` — a value without its label is not a record of
   anything. A field restored under the same id later finds its retired
   values waiting.

### Changes that are detected

| `kind` | Meaning |
|---|---|
| `added` | A field is new to the schema |
| `removed` | A field is no longer asked for |
| `renamed` | The field's name changed |
| `retyped` | The field's type changed |
| `options_changed` | A dropdown's choices changed |
| `expression_changed` | A calculation was rewritten |
| `link_changed` | A link now points at a different project |

Every `severity` from `POST /schema/preview` and `PUT /schema` is `info` —
saving a schema costs no existing entry anything, so there is nothing left to
warn about. `severity` can still read `warning` from
`GET /projects/{id}/entries/{id}/migration-preview` (see
[entries.md](entries.md#preview-migrating-an-entry-to-the-current-schema)),
where it describes what migrating that *one* entry would actually cost it.

---

## Preview a schema change

```
POST /projects/{project_id}/schema/preview
```

Reports what changes for **new** entries. Writes nothing, and — since a
schema save never touches an existing entry — doesn't simulate against any
either.

**Body:**

```json
{
  "entry_schema": [
    { "id": "f-hours", "name": "Hours", "type": "number" },
    { "id": "f-cost", "name": "Cost", "type": "computed", "expression": "{f-hours} * 50" }
  ]
}
```

**Response:** `200 OK`

```json
{
  "entry_count": 4,
  "entries_affected": 0,
  "changes": [
    {
      "kind": "removed",
      "field_id": "f-notes",
      "field_name": "Notes",
      "description": "'Notes' will no longer be asked for on new entries. Entries already recorded keep it exactly as recorded, unless individually updated.",
      "severity": "info",
      "entries_affected": 0,
      "values_coerced": 0,
      "values_retired": 0
    }
  ]
}
```

| Field | Description |
|---|---|
| `entry_count` | Entries the project has — informational; none of them are affected |
| `entries_affected` | Always `0` for a schema save. Kept in the response shape so it matches the entry-level migration preview, which reuses the same counters for a real cost |
| `changes` | One record per schema-level difference, phrased in terms of what changes for *new* entries |

**Errors:** `422` for an invalid schema, `404` if the project is not the
caller's.

---

## Apply a schema change

```
PUT /projects/{project_id}/schema
```

Same body as the preview. Replaces the project's schema. No existing entry is
changed.

**Response:** `200 OK` — the preview payload plus the updated project:

```json
{
  "entry_count": 4,
  "entries_affected": 0,
  "changes": [ "..." ],
  "project": {
    "id": "...",
    "entry_schema": [ "..." ],
    "retired_schema": [
      { "id": "f-notes", "name": "Notes", "type": "text" }
    ],
    "..." : "..."
  }
}
```

**Errors:** `422` for an invalid schema, `404` if the project is not the
caller's, `409` if the project is archived.

!!! tip "Preview and apply cannot disagree"
    Both run the same schema diff. Preview discards the result; apply writes
    it to the project. The report a user sees is therefore exactly what
    saving does — and since neither one touches an entry, that report is the
    whole story, not a preview of migration work still to come.

!!! note "PUT /projects follows the same rule"
    Sending a different `entry_schema` to
    [`PUT /projects/{project_id}`](projects.md#update-project) goes through
    this same path, so there is no route by which a schema change reaches an
    entry without that entry's own edit choosing it. Use the schema endpoints
    when you want the change report; use the project endpoint when you are
    editing a name or description and the schema happens to be part of the
    payload.

    An archived project rejects a schema change with `409`, but only when the
    schema actually differs — re-sending the schema it already has is how the
    project form saves a rename, and that keeps working.

---

## Retired fields in responses

| Field | On | Description |
|---|---|---|
| `retired_schema` | `ProjectResponse` | Definitions of fields no longer asked for |
| `retired_data` | `EntryResponse` | Values recorded under those fields, keyed by field id |

Both are returned by the API and carried through
[export and import](transfer.md), because "removed but not destroyed" that only
the database can see is a claim rather than a feature. Both default to empty, so
export files written before this feature still import.

AI Declaration: The preceding document was reviewed and edited with: Qoder, Claude Opus 5;
the "Editing a live schema" section and the preview/apply endpoints were rewritten with
Claude Code, Claude Sonnet 5, to describe entries staying frozen at their own recorded
shape rather than being eagerly migrated on every schema save.
