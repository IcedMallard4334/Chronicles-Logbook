# Database

Chronicles uses **PostgreSQL** with `asyncpg` for async access. The key design choice is using **JSONB columns** for user-defined data, allowing fully custom schemas without database migrations for most feature work.

## Entity-Relationship Diagram

```mermaid
erDiagram
    users ||--o{ projects : owns
    users ||--o| password_credentials : has
    users ||--o{ password_reset_tokens : has
    projects ||--o{ entries : contains
    projects ||--o{ tasks : contains

    users {
        uuid id PK
        varchar google_sub UK
        varchar email UK
        varchar full_name
        varchar avatar_url
        timestamp created_at
        timestamp updated_at
    }

    password_credentials {
        uuid user_id PK_FK
        varchar password_hash
    }

    password_reset_tokens {
        uuid id PK
        uuid user_id FK
        varchar token_hash
        timestamp expires_at
        timestamp used_at
        timestamp created_at
    }

    projects {
        uuid id PK
        uuid user_id FK
        varchar name
        varchar description
        jsonb entry_schema
        jsonb retired_schema
        boolean archived
        timestamp created_at
        timestamp updated_at
    }

    entries {
        uuid id PK
        uuid project_id FK
        jsonb data
        jsonb retired_data
        integer time_spent
        timestamp created_at
        timestamp updated_at
    }

    tasks {
        uuid id PK
        uuid project_id FK
        varchar title
        varchar description
        date due_date
        boolean completed
        jsonb checklist
        timestamp created_at
        timestamp updated_at
    }
```

## Table Schema

### users

| Column | Type | Description |
|---|---|---|
| `id` | UUID (PK) | Primary key |
| `google_sub` | VARCHAR(255) | Unique Google OAuth subject ID, or `password:<uuid>` for password-based accounts |
| `email` | VARCHAR(320) | Unique email address |
| `full_name` | VARCHAR(100) | Display name |
| `avatar_url` | VARCHAR(2048) | Optional profile picture URL from Google |
| `created_at` | TIMESTAMP (tz) | Account creation time |
| `updated_at` | TIMESTAMP (tz) | Last update time |

### password_credentials, password_reset_tokens (retired)

Chronicles signs in with Google only. These two tables were created by
migration `001` when password authentication was still being considered, and
they still exist in databases built from that migration, but no model maps them
and no endpoint reads or writes them. They hold no data and are candidates for
a `DROP TABLE` migration.

### projects

| Column | Type | Description |
|---|---|---|
| `id` | UUID (PK) | Primary key |
| `user_id` | UUID (FK → users) | Owner reference |
| `name` | VARCHAR(255) | Project name |
| `description` | VARCHAR | Optional description |
| `entry_schema` | JSONB | User-defined field definitions |
| `schema_version` | INTEGER | Incremented each time the schema changes (default: 1) |
| `retired_schema` | JSONB | Definitions of fields the project no longer asks for (default: `[]`) |
| `archived` | BOOLEAN | Archive status (default: false) |
| `created_at` | TIMESTAMP (tz) | Creation time |
| `updated_at` | TIMESTAMP (tz) | Last update time |

`total_time_spent` is computed at read time by summing `Entry.time_spent` for the project.

`retired_schema` exists because removing a field from a live schema does not
erase what entries already recorded under it. Keeping the definition alongside
the values is what lets those values still be labelled and, if the field is
restored, recovered.

### entries

| Column | Type | Description |
|---|---|---|
| `id` | UUID (PK) | Primary key |
| `project_id` | UUID (FK → projects) | Parent project |
| `data` | JSONB | User-defined field values |
| `schema_version` | INTEGER | The project schema version this entry was written against (default: 1) |
| `schema_snapshot` | JSONB | The field definitions as they stood when the entry was written (default: `[]`) |
| `retired_data` | JSONB | Values recorded under fields since removed (default: `{}`) |
| `time_spent` | INTEGER | Optional time spent on the entry, in minutes |
| `todo` | BOOLEAN | Marks work still outstanding rather than already done (default: false) |
| `due_date` | DATE | Optional deadline for an outstanding entry |
| `created_at` | TIMESTAMP (tz) | Creation time |
| `updated_at` | TIMESTAMP (tz) | Last update time |

`schema_snapshot` is what lets an older entry stay readable after the project's
format changes: the entry carries the shape it was written against, so it can
be displayed as it was rather than reinterpreted through today's schema.

### project_members

Records who, besides the owner, may see and contribute to a project.

| Column | Type | Description |
|---|---|---|
| `id` | UUID (PK) | Primary key |
| `project_id` | UUID (FK → projects, cascade) | The shared project |
| `user_id` | UUID (FK → users, cascade) | The person it is shared with |
| `created_at` | TIMESTAMP (tz) | When access was granted |

`UNIQUE (project_id, user_id)` — someone is either a member or not, so sharing
twice is idempotent rather than producing a second row.

Membership grants reading the project and adding entries to it. Changing the
schema, archiving, deleting, exporting and sharing onward remain with the owner
in `projects.user_id`. See the [Sharing API](../api/sharing.md).

### tasks

| Column | Type | Description |
|---|---|---|
| `id` | UUID (PK) | Primary key |
| `project_id` | UUID (FK → projects) | Parent project |
| `title` | VARCHAR(255) | Task title |
| `description` | VARCHAR | Optional description |
| `due_date` | DATE | Optional due date |
| `completed` | BOOLEAN | Completion status (default: false) |
| `checklist` | JSONB | Ordered list of checklist items |
| `created_at` | TIMESTAMP (tz) | Creation time |
| `updated_at` | TIMESTAMP (tz) | Last update time |

### Sprint 3 tables

Six tables added by migrations `010`–`013`, none of which altered an existing
table — every one of these is purely additive.

#### entry_revisions

| Column | Type | Description |
|---|---|---|
| `id` | UUID (PK) | Primary key |
| `entry_id` | UUID (FK → entries, cascade) | The entry this is a past version of |
| `revision` | INTEGER | 1, 2, 3… per entry |
| `data`, `retired_data`, `schema_version`, `schema_snapshot`, `title`, `time_spent`, `todo`, `due_date` | — | The entry's full state at this revision — same shape as `entries` itself |
| `changed_by` | UUID (FK → users, set null) | Who made this change, if known |
| `changed_at` | TIMESTAMPTZ | When |

`UNIQUE (entry_id, revision)`. Existing entries were backfilled with a
revision 1 baseline when this table was introduced, so history is available
from the day it shipped, not only for entries edited afterwards. Read-only:
the entries API doesn't yet let a user restore an old revision, only view it.

#### entry_rules

| Column | Type | Description |
|---|---|---|
| `id` | UUID (PK) | Primary key |
| `project_id` | UUID (FK → projects, cascade) | The project this rule runs in |
| `name` | VARCHAR(100) | Owner-given label |
| `enabled` | BOOLEAN | Rules can be switched off without deleting them |
| `match` | VARCHAR(3) | `"all"` or `"any"` of `conditions` |
| `conditions` | JSONB | The structured-search condition list this rule matches against |
| `actions` | JSONB | Add tags / fill in a field / mark as to-do |
| `created_by` | UUID (FK → users, set null) | Owner only can create/edit |

#### entry_recurrences and recurrence_occurrences

| Column (`entry_recurrences`) | Type | Description |
|---|---|---|
| `id` | UUID (PK) | Primary key |
| `entry_id` | UUID (FK → entries, cascade), unique | The template entry that repeats |
| `project_id` | UUID (FK → projects, cascade) | Denormalised for lookup without a join |
| `frequency` | VARCHAR(10) | `daily` / `weekly` / `monthly` |
| `interval` | INTEGER | Every N of that unit |
| `starts_on`, `ends_on` | DATE | Recurrence window |
| `next_on` | DATE, indexed | What the background check polls on |
| `active` | BOOLEAN | Stoppable without deleting |

`recurrence_occurrences` records one row per occurrence already created
(`UNIQUE (recurrence_id, occurrence_on)`), so two simultaneous background
checks can't create the same day's entry twice.

#### statistics_layouts and saved_statistics

| Table | Key columns | Description |
|---|---|---|
| `statistics_layouts` | `user_id` (PK, FK → users, cascade), `panels` (JSONB) | One row per user: which Statistics-page panels they've arranged, and where (US-3.7) |
| `saved_statistics` | `id` (PK), `user_id`, `project_id`, `name`, `expression` (VARCHAR 500) | A figure the user defines for themselves — the same computed-field expression grammar as a schema's Calculation fields, evaluated over a project's entries instead of one entry (US-3.8) |

## JSONB schema format

The `entry_schema` column in `projects` stores the user-defined field definitions:

```json
[
  { "id": "<uuid>", "name": "Hours spent", "type": "number" },
  { "id": "<uuid>", "name": "What I did", "type": "text" },
  { "id": "<uuid>", "name": "Status", "type": "dropdown", "options": ["In progress", "Done", "Blocked"] },
  { "id": "<uuid>", "name": "Related project", "type": "project_reference" },
  { "id": "<uuid>", "name": "Minutes", "type": "computed", "expression": "{hours-field-id} * 60" }
]
```

Supported field types: `text`, `number`, `date`, `dropdown` (with `options`
array), `project_reference`, and `computed` (with `expression`). The last two are
documented in full on [Schema and field types](../api/schema.md).

The `data` column in `entries` stores values keyed by field ID:

```json
{
  "field-uuid-1": 3,
  "field-uuid-2": "Finished the login page",
  "field-uuid-3": "Done",
  "field-uuid-4": "9f2c…",
  "field-uuid-5": 180
}
```

A `project_reference` value is the referenced project's UUID as a string. It is
**not** a foreign key: enforcing one would mean a JSONB value could block a
project from being deleted, so referential integrity is checked on write instead
and a dangling reference is rendered rather than errored.

A `computed` value is written by the server on every entry write, so `data` can
be read without re-evaluating any expressions.

`retired_schema` and `retired_data` mirror the two formats above — the same field
definitions and the same id-keyed values, holding what the live schema no longer
asks for:

```json
{
  "retired_schema": [{ "id": "field-uuid-6", "name": "Mood", "type": "text" }],
  "retired_data": { "field-uuid-6": "Rained all day" }
}
```

The `checklist` column in `tasks` stores an ordered array of items:

```json
[
  { "id": "item-1", "text": "Write tests", "completed": true },
  { "id": "item-2", "text": "Update docs", "completed": false }
]
```

## Schema migrations

Tables are auto-created on app startup via `Base.metadata.create_all`. For production schema changes, migrations should be managed separately.

Raw SQL migrations live in `backend/migrations/` and are written to be safe to
re-run:

| File | Adds |
|---|---|
| `001_schema_updates.sql` | Earlier column additions |
| `002_calendar_token_timestamps.sql` | Calendar token timestamps |
| `003_login_sessions.sql` | Login session tracking |
| `004_retired_schema_fields.sql` | `projects.retired_schema`, `entries.retired_data` |

!!! note
    Because user-defined data lives in JSONB columns, most feature work (new field types, new statistics, checklists) requires **no database migration** — just backend logic changes. Core column additions, such as `entries.time_spent` or `entries.retired_data`, do require a migration or `ALTER TABLE` in production.

!!! warning "Two senses of 'migration'"
    This page uses the word for *database* migrations — changes to the table
    definitions above. Chronicles also migrates **entry data** when a user edits
    a project's `entry_schema`, which touches no table definitions at all: it
    rewrites JSONB values inside `entries.data`. That is described on
    [Schema and field types](../api/schema.md#editing-a-live-schema).

AI Declaration: The preceding document was reviewed and edited with: Qoder.
The "Sprint 3 tables" section above was added with Claude Code (Sonnet 5).
