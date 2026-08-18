# Database

Chronicles uses **PostgreSQL** with `asyncpg` for async access. The key design choice is using **JSONB columns** for user-defined data, allowing fully custom schemas without database migrations.

## Table schema

### users

| Column | Type | Description |
|---|---|---|
| `id` | UUID (PK) | Primary key |
| `google_id` | VARCHAR | Unique Google OAuth subject ID |
| `email` | VARCHAR | Email from Google |
| `display_name` | VARCHAR | Display name from Google |
| `created_at` | TIMESTAMP | Account creation time |
| `updated_at` | TIMESTAMP | Last update time |

### projects

| Column | Type | Description |
|---|---|---|
| `id` | UUID (PK) | Primary key |
| `owner_id` | UUID (FK → users) | Owner reference |
| `title` | VARCHAR(255) | Project name |
| `description` | VARCHAR(500) | Optional description |
| `entry_schema` | JSONB | User-defined field definitions |
| `stats` | JSONB | Computed statistics |
| `archived_at` | TIMESTAMP | When archived (NULL = active) |
| `created_at` | TIMESTAMP | Creation time |
| `updated_at` | TIMESTAMP | Last update time |

### entries

| Column | Type | Description |
|---|---|---|
| `id` | UUID (PK) | Primary key |
| `project_id` | UUID (FK → projects) | Parent project |
| `entry_date` | TIMESTAMP | When the entry was logged |
| `data` | JSONB | User-defined field values |
| `created_at` | TIMESTAMP | Creation time |
| `updated_at` | TIMESTAMP | Last update time |

### tasks

| Column | Type | Description |
|---|---|---|
| `id` | UUID (PK) | Primary key |
| `project_id` | UUID (FK → projects) | Parent project |
| `title` | VARCHAR(255) | Task title |
| `description` | VARCHAR | Optional description |
| `due_date` | DATE | Optional due date |
| `completed` | BOOLEAN | Completion status (default: false) |
| `created_at` | TIMESTAMP | Creation time |
| `updated_at` | TIMESTAMP | Last update time |

## JSONB schema format

The `entry_schema` column in `projects` stores the user-defined field definitions:

```json
{
  "fields": [
    { "name": "Hours worked", "type": "number" },
    { "name": "What I did", "type": "text" },
    { "name": "Status", "type": "dropdown", "options": ["In progress", "Done", "Blocked"] }
  ]
}
```

Supported field types: `text`, `number`, `date`, `dropdown` (with `options` array).

The `data` column in `entries` stores values matching this schema:

```json
{
  "Hours worked": 3,
  "What I did": "Finished the login page",
  "Status": "Done"
}
```

## Schema migrations

Tables are auto-created on app startup via `Base.metadata.create_all`. For production schema changes, migrations should be managed separately.

!!! note
    Because user-defined data lives in JSONB columns, most feature work (new field types, new statistics) requires **no database migration** — just backend logic changes.
