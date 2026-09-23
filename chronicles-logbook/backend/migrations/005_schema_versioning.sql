-- Preserve the schema used when each entry was created.
-- Safe to run repeatedly.

ALTER TABLE projects
    ADD COLUMN IF NOT EXISTS schema_version INTEGER NOT NULL DEFAULT 1;

ALTER TABLE entries
    ADD COLUMN IF NOT EXISTS schema_version INTEGER NOT NULL DEFAULT 1;

ALTER TABLE entries
    ADD COLUMN IF NOT EXISTS schema_snapshot JSONB NOT NULL DEFAULT '[]'::jsonb;

-- Backfill legacy entries using their project's current schema.
UPDATE entries AS e
SET
    schema_version = p.schema_version,
    schema_snapshot = p.entry_schema
FROM projects AS p
WHERE e.project_id = p.id
  AND e.schema_snapshot = '[]'::jsonb
  AND p.entry_schema <> '[]'::jsonb;

ALTER TABLE projects
    DROP CONSTRAINT IF EXISTS ck_projects_schema_version_positive;

ALTER TABLE projects
    ADD CONSTRAINT ck_projects_schema_version_positive
    CHECK (schema_version >= 1);

ALTER TABLE entries
    DROP CONSTRAINT IF EXISTS ck_entries_schema_version_positive;

ALTER TABLE entries
    ADD CONSTRAINT ck_entries_schema_version_positive
    CHECK (schema_version >= 1);
