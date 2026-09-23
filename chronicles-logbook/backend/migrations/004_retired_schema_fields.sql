-- Chronicles: keep retired schema fields and their values (US-2.6, US-2.7)
--
-- Editing a live schema must not destroy history. When a field is removed, or
-- retyped past what its recorded values can be coerced into, the definition
-- moves to projects.retired_schema and each entry's value moves to
-- entries.retired_data. Both are kept out of the live entry_schema / data so
-- that validation, the CSV export and every other reader see only the fields
-- an entry form would offer today.
--
-- All statements are idempotent and safe to run repeatedly on local
-- PostgreSQL and Azure PostgreSQL.

ALTER TABLE projects
    ADD COLUMN IF NOT EXISTS retired_schema JSONB NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE entries
    ADD COLUMN IF NOT EXISTS retired_data JSONB NOT NULL DEFAULT '{}'::jsonb;
