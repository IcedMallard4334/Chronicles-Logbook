# Schema and field types

A project's `entry_schema` decides what its entries record. This page documents
the field types available, and the endpoints for changing a schema after entries
already exist.

## Field types

| Type | Shown as | Value in `data` | Required on create | Extra keys |
|---|---|---|---|---|
| `text` | Text | string | Yes | — |
| `number` | Number | integer or float | Yes | — |
| `date` | Date | ISO date string (`YYYY-MM-DD`) | Yes | — |
| `dropdown` | Choice | one of `options` | Yes | `options` (non-empty array of strings) |
| `tags` | Tags | array of strings | Yes (may be `[]`) | — |
| `checklist` | Checklist | array of `{id, text, completed}` | Yes (may be `[]`) | — |
| `link` | Entry link | entry UUID, or `""` | Yes (may be `""`) | — |
| `project_reference` | Project link | project UUID | Never — server-derived | `linked_project_id` |
| `computed` | Calculation | number or `null` | Never — server-derived | `expression` |

The "Shown as" column is the name the interface uses. The wire format is a fine
identifier and a poor label: `project_reference` tells a developer what it is
and tells an owner nothing, so the builder shows each type with the question it
answers, a worked example and a line about what filling it in is like. That
copy lives in one place, `src/fieldTypes.js`, and every screen reads from it.

### Choosing between the list-shaped types

Three types hold something list-like and are easy to confuse:

| You want | Use | Why |
|---|---|---|
| Exactly one answer from a settled set | `dropdown` | The set is fixed in the schema, so it can be grouped and charted |
| Several labels, made up as you go | `tags` | No list to maintain; statistics group one tag at a time |
| Steps within one entry, ticked off | `checklist` | Progress inside an entry, not across entries — for that, use tasks |

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

Changing the target is a schema edit. Entries written from then on carry the
new target; entries already written keep the project they pointed at, because a
format change never rewrites what is already recorded (see
[Editing a live schema](#editing-a-live-schema)). The change is reported as
`link_changed` in the [preview](#preview-a-schema-change) before it is applied.

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

**A schema change writes nothing to any entry.** This is the single most
important guarantee the API makes, and it was not always true: an earlier
design reshaped every entry onto the new format — backfilling new fields,
coercing old values, replacing what it could not read with a default. That kept
one tidy table and it was wrong. It wrote values into a logbook its owner never
wrote, and it could turn a figure somebody recorded into a default they did not
choose. A logbook whose past changes when you edit a form is not a record of
anything.

What a change does:

1. **The project takes the new format.** Every entry written from then on is
   captured under it.
2. **Every existing entry keeps its own values**, byte for byte, and keeps the
   format it was written under in `entries.schema_snapshot`. An entry written
   before snapshots were stored has one filled in from the schema being
   replaced — the last moment its original format is knowable. This is the only
   write a schema change makes to an entry, and it adds a label rather than
   changing an answer.
3. **A field that leaves the live format keeps its definition** in
   `projects.retired_schema`, so the values already recorded under it still
   have a label. A value without its label is not a record of anything.

Reading is where the two formats meet. An entry is shown under the project's
current format wherever the field ids line up, and under its own snapshot
wherever they do not. A field an entry predates reads as *not recorded* —
distinct from a blank, because nobody answered it. That reconciliation is done
fresh on every read, so it can never damage the record, which is the whole point
of doing it there rather than in the database.

!!! note "`retired_data` still exists and is now always empty"
    Nothing moves values into it any more, because nothing removes them from
    `data`. It stays on the model, in responses and in the export format so
    that logbooks written under the old behaviour — and export files from that
    era — still load and still show what they recorded.

### Changes that are detected

| `kind` | Meaning | Severity |
|---|---|---|
| `added` | A field is new; earlier entries have nothing to show under it | `info` |
| `removed` | A field is no longer asked for; what was recorded stays readable | `warning` if any entry recorded a value |
| `renamed` | The field's name changed; nothing else does | `info` |
| `retyped` | The field's type changed from now on; past values stay as written | `warning` if any past value could not have come from the new type |
| `options_changed` | A dropdown's choices changed; entries that chose a withdrawn option keep it | `warning` if any entry did |
| `expression_changed` | A calculation is worked out differently from now on; past figures stand | `info` |
| `link_changed` | A link points somewhere else from now on; past entries keep their target | `info` |

`severity` is decided by the server so that the review screen and the API
cannot form different opinions about which changes are worth stopping for. It
no longer means "you are about to lose something" — nothing is lost — but
"part of your record will read under the older format from here on".

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
      "description": "'Notes' will no longer be asked for. What past entries recorded under it is kept and stays readable.",
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
| `entries_affected` | How many would **read** differently. Their stored values do not change |
| `changes` | One record per difference |
| `values_coerced` | Always `0`. It counted values a migration rewrote in place, and nothing is rewritten now; kept so a client built against the older API still parses this one |
| `values_retired` | Entries holding a value the new format would not ask for. They keep it — "retired" here means no longer collected, never gone |

**Errors:** `422` for an invalid schema, `404` if the project is not the
caller's.

---

## Apply a schema change

```
PUT /projects/{project_id}/schema
```

Same body as the preview. Replaces the project's format. Entry values are not
touched.

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
    Both endpoints run the same analysis against the same entries. Preview
    discards the result; apply writes the format change. The report a user
    approves is therefore what happens, not an estimate of it.

!!! note "PUT /projects behaves the same way"
    Sending a different `entry_schema` to
    [`PUT /projects/{project_id}`](projects.md#update-project) goes through the
    same code, so there is no route by which a schema change reaches the
    record. Use the schema endpoints when you want the change report; use the
    project endpoint when you are editing a name or description and the schema
    happens to be part of the payload.

    An archived project rejects a schema change with `409`, but only when the
    schema actually differs — re-sending the schema it already has is how the
    project form saves a rename, and that keeps working.

---

## Retired fields in responses

| Field | On | Description |
|---|---|---|
| `retired_schema` | `ProjectResponse` | Definitions of fields no longer asked for, so values recorded under them still have a label |
| `schema_snapshot` | `EntryResponse` | The format this entry was written under |
| `schema_version` | `EntryResponse`, `ProjectResponse` | Which revision of the format |
| `retired_data` | `EntryResponse` | Legacy. Values moved out of `data` by the old migrating behaviour; always empty on new data |

All are returned by the API and carried through
[export and import](transfer.md). `schema_snapshot` is the important one for a
round trip: a project's format moves on while its past entries keep theirs, so
an export carrying only the project's current format would restore a logbook
whose older half no longer has labels for what it recorded. Import validates
each entry against its own snapshot for the same reason.

Every field defaults to empty, so export files written before any of this
existed still import — those entries simply fall back to the project's format,
which is what they were already being read under.

AI Declaration: The preceding document was reviewed and edited with: Qoder, Claude Opus 5
