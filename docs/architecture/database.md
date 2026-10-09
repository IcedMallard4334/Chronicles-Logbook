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
        uuid user_id PK,FK
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
| `google_sub` | VARCHAR(255) | Unique Google OAuth subject ID, or `dev-login-<uuid>` for an account made with the local-development sign-in (see [Authentication](../api/authentication.md)) |
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

### Tables and columns added after Sprint 3's review

| Table or column | Purpose |
|---|---|
| `entries.status`, `projects.statuses`, `entry_revisions.status` | Custom statuses. `status` names one of the project's statuses (default pair *Still to do* / *Done*); `todo` is derived from it. New entries get a status from a `before_insert` hook in `models.py`, so every creation path (API, rules, recurrence, import) is covered. |
| `entries.due_time`, `entry_revisions.due_time` | Optional time of day for a deadline. |
| `entries.deleted_at` | Soft deletion: a timestamp instead of removing the row, so a deletion is a version that can be reverted. A global query filter hides deleted entries unless asked for. |
| `entry_revisions.action`, `note`, `changed_fields`, `previous_values`, `reverted_to` | What each version did, why, which values changed and what they were. |
| `dashboards.columns` | How many blocks wide the dashboard grid is (default 3). Each panel's own size (`w`, `h`) lives inside the `panels` JSON. |
| `mira_conversations` | `id`, `user_id`, `title`, `created_at`, `updated_at`: a saved chat with Mira. |
| `mira_messages` | `conversation_id`, `role` (`user` or `assistant`), `content`, `thinking`, `created_at`. The reply is stamped strictly after its question so ordering is stable. |
| `user_activity_days` | `(user_id, day, kind)` primary key, `kind` = `login` or `interaction`: the days behind the two streaks. |
| `user_achievements` | `(user_id, key)` primary key, `earned_at`, `seen`: badges earned and whether the celebration has been shown. A hidden `__initialised__` row marks the first check so existing accounts are awarded quietly. |

### Tables the first pass of this page missed

Found by the docs audit (`scripts/docs_audit.py`) on 2026-10-09 and recorded here.

| Table | Key columns | Description |
|---|---|---|
| `login_sessions` | `token_hash` (PK, SHA-256), `user_id` (FK → users, cascade), `expires_at` | The server side of the 30-day session cookie. Only the hash of the cookie's value is stored, so a database leak does not yield usable cookies. |
| `mira_consents` | `user_id` (PK, FK → users, cascade), `accepted`, `version` (VARCHAR 30), `updated_at` | Whether the person allowed Mira to read their workspace, and which version of the notice they answered. A choice against an older version no longer counts (see [Mira actions](../features/mira-actions.md#consent)). |
| `saved_filters` | `id` (PK), `user_id` (FK → users, cascade), `name` (VARCHAR 100), `criteria` (JSONB), timestamps; **unique `(user_id, name)`** | Named, reusable Entries-page filters (US-2.12). Criteria are JSON so a new filter control needs no schema change; the unique pair is what makes saving a name twice an overwrite. See [Saved filters](../api/saved-filters.md). |
| `google_calendar_accounts` | `id` (PK), `user_id` (FK → users, cascade, indexed), `calendar_id` (VARCHAR 512), `label`, `refresh_token`, `created_at`; unique `(user_id, calendar_id)` | One connected Google account per row, so a person can connect several. Holds only a refresh token; events are fetched live and never stored. |
| `google_calendar_tokens` | `user_id` (PK, FK → users, cascade), `refresh_token`, timestamps | The original single-account token, from before accounts were stored separately. It still works and is shown as the account `legacy`; new connections go to `google_calendar_accounts`. |
| `project_schema_changes` | `id` (PK), `project_id` (FK → projects, cascade, indexed), `changed_by` (FK → users, **set null**, indexed), `from_version`, `to_version`, `summary` (JSONB, `[{kind, field}]`), `changed_at` (indexed) | Who changed a project's schema, and when, so the team view can say. A schema save only changes the project and touches no entry, so nothing else recorded the author. Written only when the schema really changed. Begins on the day it was introduced; earlier changes are not known and are not backfilled. `changed_by` is cleared, not cascaded, when an account goes (DB-44). |
| `project_members.owner_seen_at` | (column) | When the owner dismissed the notice that this invitation was answered. Null until then. `responded_at` and this column together drive `GET /invitations/answers`. Added by migration `024` and the start-up patch. |
| `calendar_activities` | `id` (PK), `user_id` (FK → users, cascade, indexed), `title` (VARCHAR 255), `description` (VARCHAR 4000), `day` (DATE, indexed), `all_day`, `start_time` / `end_time` (VARCHAR 5, `HH:MM`), `created_at` | A person's own scheduled items. Private to Chronicles and **never written to Google Calendar**. Times are `HH:MM` text because an activity has no time zone: it happens at that local time on that local day. |

```mermaid
erDiagram
    users ||--o{ mira_conversations : has
    mira_conversations ||--o{ mira_messages : contains
    users ||--o{ user_activity_days : logs
    users ||--o{ user_achievements : earns
    users ||--o| dashboards : arranges
```

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
| `005_schema_versioning.sql` | `projects.schema_version`, `entries.schema_version` and `schema_snapshot` |
| `006_project_members.sql` | Sharing a project: `project_members` |
| `007_authorship.sql` | `entries.created_by`, `tasks.created_by` / `completed_by` (nullable, `ON DELETE SET NULL`) |
| `008_project_invitations.sql` | `project_members.status` and invitation columns; **defaults to `accepted`** so existing collaborators keep their access |
| `009_entry_title.sql` | `entries.title`, independent of any project's schema |
| `010_entry_revisions.sql` | `entry_revisions`: the immutable version history |
| `011_entry_automation.sql` | `entry_rules`, `entry_recurrences`, `recurrence_occurrences` |
| `012_statistics_layout.sql` | `statistics_layouts` |
| `013_saved_statistics.sql` | `saved_statistics` |
| `014_entry_history.sql` | Soft deletion, version actions/notes/changed fields, baseline versions |
| `015_entry_due_time.sql` | `due_time` on entries and versions |
| `016_mira_conversations.sql` | `mira_conversations`, `mira_messages` |
| `017_activity_streaks.sql` | `user_activity_days` |
| `018_dashboard_grid.sql` | `dashboards.columns` |
| `019_entry_statuses.sql` | `projects.statuses`, `entries.status`, `entry_revisions.status`, backfill |
| `020_achievements.sql` | `user_achievements` |
| `021_task_due_time.sql` | `tasks.due_time`, an optional time of day for a task's deadline |
| `022_rule_triggers.sql` | `entry_rules.trigger` (`created` or `status`) and `trigger_status` |
| `023_project_schema_changes.sql` | `project_schema_changes`: who changed a project's schema, and when |
| `024_invitation_answer_notices.sql` | `project_members.owner_seen_at`: the owner's dismissal of an "answered" notice |

These files are the **record** of each change. They are not run by the deploy: what reaches an existing production
database is the start-up patch in `main.py` (`_ADDED_COLUMNS`), and a test fails if a migration adds a column that
list does not carry. Why that is so, and what it costs, is DB-51 in
[Decisions: data and backend](../decisions/data-and-backend.md#db-51-schema-changes-reach-production-through-a-startup-patch-not-alembic).
Two branches once both numbered their migration `004`; the later one became `005` (PL-18).

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
