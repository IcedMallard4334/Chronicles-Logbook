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
        boolean archived
        timestamp created_at
        timestamp updated_at
    }

    entries {
        uuid id PK
        uuid project_id FK
        jsonb data
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

### password_credentials

| Column | Type | Description |
|---|---|---|
| `user_id` | UUID (PK, FK → users) | Owner reference |
| `password_hash` | VARCHAR(512) | Bcrypt-hashed password |

### password_reset_tokens

| Column | Type | Description |
|---|---|---|
| `id` | UUID (PK) | Primary key |
| `user_id` | UUID (FK → users) | Owner reference |
| `token_hash` | VARCHAR(64) | SHA-256 hash of the reset token |
| `expires_at` | TIMESTAMP (tz) | Token expiry |
| `used_at` | TIMESTAMP (tz) | When the token was used (NULL = unused) |
| `created_at` | TIMESTAMP (tz) | Token creation time |

### projects

| Column | Type | Description |
|---|---|---|
| `id` | UUID (PK) | Primary key |
| `user_id` | UUID (FK → users) | Owner reference |
| `name` | VARCHAR(255) | Project name |
| `description` | VARCHAR | Optional description |
| `entry_schema` | JSONB | User-defined field definitions |
| `archived` | BOOLEAN | Archive status (default: false) |
| `created_at` | TIMESTAMP (tz) | Creation time |
| `updated_at` | TIMESTAMP (tz) | Last update time |

`total_time_spent` is computed at read time by summing `Entry.time_spent` for the project.

### entries

| Column | Type | Description |
|---|---|---|
| `id` | UUID (PK) | Primary key |
| `project_id` | UUID (FK → projects) | Parent project |
| `data` | JSONB | User-defined field values |
| `time_spent` | INTEGER | Optional time spent on the entry, in minutes |
| `created_at` | TIMESTAMP (tz) | Creation time |
| `updated_at` | TIMESTAMP (tz) | Last update time |

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
  { "id": "<uuid>", "name": "Status", "type": "dropdown", "options": ["In progress", "Done", "Blocked"] }
]
```

Supported field types: `text`, `number`, `date`, `dropdown` (with `options` array).

The `data` column in `entries` stores values keyed by field ID:

```json
{
  "field-uuid-1": 3,
  "field-uuid-2": "Finished the login page",
  "field-uuid-3": "Done"
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

!!! note
    Because user-defined data lives in JSONB columns, most feature work (new field types, new statistics, checklists) requires **no database migration** — just backend logic changes. Core column additions, such as `entries.time_spent`, do require a migration or `ALTER TABLE` in production.
