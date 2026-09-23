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
be displayed as it was rather than reinterpreted through today's schema. It is
also the **only** column a schema change writes to an entry, and only when the
entry has none — values in `data` are never touched. See
[Editing a live schema](../api/schema.md#editing-a-live-schema).

`retired_data` is legacy. It held values moved out of `data` by an earlier
design that reshaped every entry onto a new format; nothing writes to it now,
and it stays so that logbooks and export files from that era still load.

### project_members

Records who, besides the owner, has been **invited** to a project, and whether
they took it up.

| Column | Type | Description |
|---|---|---|
| `id` | UUID (PK) | Primary key |
| `project_id` | UUID (FK → projects, cascade) | The project |
| `user_id` | UUID (FK → users, cascade) | The person invited |
| `status` | VARCHAR(20) | `pending`, `accepted` or `declined` |
| `invited_by` | UUID (FK → users, set null) | Who sent the invitation |
| `responded_at` | TIMESTAMP (tz) | When they answered, if they have |
| `created_at` | TIMESTAMP (tz) | When the invitation was sent |

`UNIQUE (project_id, user_id)` — somebody is invited once, so inviting twice
updates the row rather than producing a second one. A declined row is kept
rather than deleted, so that "no" is an answer the owner can see rather than
silence; re-inviting moves it back to `pending`.

Only `accepted` grants anything. `_get_readable_project` and the project list
both filter on it, so a pending invitation is invisible to every read path.

!!! warning "The default is `accepted`, deliberately"
    `status` is declared with `server_default='accepted'` even though new rows
    are created as `pending`. Every row that already existed was written under
    the old grant-on-invite behaviour and already confers access; defaulting to
    `pending` would silently revoke every shared project from the people
    currently collaborating on one.

Accepted membership grants reading the project, adding entries to it, and
correcting the entries that person wrote themselves. Changing the schema,
archiving, deleting, exporting, editing somebody else's entry and inviting
onward remain with the owner in `projects.user_id`. See the
[Sharing API](../api/sharing.md).

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
| `005_schema_versioning.sql` | `projects.schema_version`, `entries.schema_version`, `entries.schema_snapshot` |
| `006_project_members.sql` | The `project_members` table |
| `007_authorship.sql` | `created_by` / `completed_by` on entries and tasks |
| `008_project_invitations.sql` | `project_members.status`, `invited_by`, `responded_at` |

!!! note
    Because user-defined data lives in JSONB columns, most feature work (new field types, new statistics, checklists) requires **no database migration** — just backend logic changes. Core column additions, such as `entries.time_spent` or `entries.retired_data`, do require a migration or `ALTER TABLE` in production.

!!! warning "Two senses of 'migration'"
    This page uses the word for *database* migrations — changes to the table
    definitions above. Editing a project's `entry_schema` used to be called a
    migration too, because it rewrote JSONB values inside `entries.data`. It no
    longer touches them: a format change writes the new schema to the project
    and, at most, fills in a missing `entries.schema_snapshot`. See
    [Editing a live schema](../api/schema.md#editing-a-live-schema).

AI Declaration: The preceding document was reviewed and edited with: Qoder
