# Public reference endpoints

Four endpoints need **no sign-in**. Everything else in the API needs `Authorization: Bearer <token>`
([Authentication](authentication.md)).

| Endpoint | Returns |
|---|---|
| `GET /health` | `{"status": "ok"}`. Does no database work, so it measures the network and the framework only. |
| `GET /public/info` | What the API is, where its OpenAPI description and interactive docs are, and how to authenticate. |
| `GET /public/field-types` | Every field type a schema can use: what it stores, its limits and how it can be searched. |
| `GET /public/limits` | The limits the API enforces, read from the constants the validation itself uses. |

They exist because someone building against Chronicles needs to know what it accepts **before** they have an
account, and because they are safe to open: every response is the same for every caller, holds nobody's data,
touches no database and reads no session. `Cache-Control: public, max-age=3600` lets a browser or a CDN keep them
for an hour, since they only change when the code does. They only answer `GET`; anything else is `405`.

## `GET /public/info`

```json
{
  "name": "Chronicles API",
  "description": "The API behind Chronicles, a digital logbook with entries shaped by the person using it.",
  "openapi": "/openapi.json",
  "interactive_docs": "/docs",
  "health": "/health",
  "authentication": {
    "scheme": "Bearer token (JWT)",
    "how": "Sign in with Google in the app; the app then sends the token in the Authorization header.",
    "public_endpoints": ["/health", "/public/info", "/public/field-types", "/public/limits"]
  }
}
```

## `GET /public/field-types`

One object per type, in the order the schema editor offers them.

```json
[
  { "type": "text", "label": "Short text", "description": "A name, a place or a line of writing.",
    "stores": "string", "max_length": 255, "search_operators": ["contains", "equals"] },
  { "type": "number", "label": "Number", "description": "A figure you can add up.",
    "stores": "number", "search_operators": ["between", "equals", "gt", "gte", "lt", "lte"] },
  { "type": "tags", "label": "Tags", "description": "Short labels you can filter entries by.",
    "stores": "list of 1 to 10 strings, each up to 30 characters", "search_operators": ["has", "has_all", "has_any"] }
]
```

`max_length` appears only on the two text types. `search_operators` are the operators a structured search accepts for
that type (see [Entries](entries.md)); a type with none returns `[]`. The same ten types are described, with their
rules, in [Schema and field types](schema.md).

## `GET /public/limits`

```json
{
  "short_text_max_length": 255, "long_text_max_length": 5000,
  "tags_per_field": 10, "tag_max_length": 30,
  "checklist_max_items": 20, "checklist_item_max_length": 30,
  "time_spent_max_minutes": 600000,
  "statuses_per_project": { "min": 2, "max": 8 },
  "rules_per_project": 20, "rule_max_conditions": 10, "rule_max_days_ahead": 365,
  "search_max_conditions": 10,
  "project_name_max_length": 255, "project_description_max_length": 4000,
  "mira_message_max_length": 2000
}
```

A test confirms the advertised project-name limit really is the limit (one character over is `422`, exactly at it is
`201`), and another that every field type is described, so the catalogue cannot quietly fall behind a new type.

## What is deliberately not public

- **Counts of users, projects or entries.** They say how much Chronicles is used, and nobody needs that to build
  against it.
- **Anything about a person or their logbook,** including a read-only view of a project. Opening a record to the
  world is a privacy decision for its owner, not something to add as a side effect.

Why this shape: DB-69 in [Decisions: data and backend](../decisions/data-and-backend.md).

AI Declaration: Written with Claude Code (Sonnet 5.5) from `app/routers/public.py`, 2026-10-09.
