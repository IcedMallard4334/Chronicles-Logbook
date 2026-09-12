# Schema and field types

A project's `entry_schema` decides what its entries record. This page documents
the field types available, and the endpoints for changing a schema after entries
already exist.

## Field types

| Type | Value in `data` | Required on create | Extra keys |
|---|---|---|---|
| `text` | string | Yes | — |
| `number` | integer or float | Yes | — |
| `date` | ISO date string (`YYYY-MM-DD`) | Yes | — |
| `dropdown` | one of `options` | Yes | `options` (non-empty array of strings) |
| `project_reference` | project UUID | Never — server-derived | `linked_project_id` |
| `computed` | number or `null` | Never — server-derived | `expression` |

A field definition is `{ "id": "...", "name": "...", "type": "..." }` plus the
extra keys its type requires. Field names must be unique within a schema
(case-insensitively); ids must be unique and are how values in `data` are keyed.

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

Changing the schema of a project that already has entries has to bring those
entries along. Three rules make that safe:

1. **A new field is backfilled** on every existing entry with a default suited
   to its type: `""` for text, `0` for number, the first choice for a dropdown,
   the link's target for a reference, and for a date the day that entry was
   captured. (The entry's own capture date is the only honest guess available;
   today's date would be wrong on every historical entry.)
2. **A value that cannot survive the change is retired, not deleted.** It moves
   to `entries.retired_data`, and its field definition to
   `projects.retired_schema` — a value without its label is not a record of
   anything.
3. **A field restored under the same id finds its values waiting.** This is what
   makes removing a field by mistake recoverable.

### Changes that are detected

| `kind` | Meaning | Severity |
|---|---|---|
| `added` | A field is new to the schema | `info` |
| `removed` | A field is no longer asked for | `warning` if any entry had a value |
| `renamed` | The field's name changed; values are untouched | `info` |
| `retyped` | The field's type changed; values are coerced or retired | `warning` if any value moves |
| `options_changed` | A dropdown's choices changed; values outside the new list are retired | `warning` if any value moves |
| `expression_changed` | A calculation was rewritten; every entry is recomputed | `info` |
| `link_changed` | A link now points at a different project; every entry is relinked | `info` |

`severity` is decided by the server so that the review screen and the API
cannot form different opinions about which changes are worth stopping for.

---

## Preview a schema change

```
POST /projects/{project_id}/schema/preview
```

Reports what a change *would* do. Writes nothing.

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
  "entries_affected": 3,
  "changes": [
    {
      "kind": "removed",
      "field_id": "f-notes",
      "field_name": "Notes",
      "description": "'Notes' is no longer asked for.",
      "severity": "warning",
      "entries_affected": 3,
      "values_coerced": 0,
      "values_retired": 3
    }
  ]
}
```

| Field | Description |
|---|---|
| `entry_count` | Entries the project has |
| `entries_affected` | How many would change. `0` means the edit is free of consequence |
| `changes` | One record per difference, with what it costs |
| `values_coerced` | Values rewritten to fit the new type or option list |
| `values_retired` | Values moved to `retired_data` |

**Errors:** `422` for an invalid schema, `404` if the project is not the
caller's.

---

## Apply a schema change

```
PUT /projects/{project_id}/schema
```

Same body as the preview. Replaces the schema and migrates every entry.

**Response:** `200 OK` — the preview payload plus the updated project:

```json
{
  "entry_count": 4,
  "entries_affected": 3,
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
    Both endpoints call the same migration function against the same entries.
    Preview discards the result; apply writes it. The report a user approves is
    therefore what happens, not an estimate of it.

!!! note "PUT /projects also migrates"
    Sending a different `entry_schema` to
    [`PUT /projects/{project_id}`](projects.md#update-project) runs the same
    migration, so there is no route by which a schema changes and its entries
    do not. Use the schema endpoints when you want the change report; use the
    project endpoint when you are editing a name or description and the schema
    happens to be part of the payload.

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

AI Declaration: The preceding document was reviewed and edited with: Qoder, Claude Opus 5
