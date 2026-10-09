-- Who changed a project's schema, and when (the project team view).
--
-- A new table and no change to any existing one, so the app's startup
-- `create_all` also builds it; this file records the exact DDL for reviewers and
-- for applying by hand. Changes made before this existed are not known and are
-- not backfilled.

CREATE TABLE IF NOT EXISTS project_schema_changes (
    id UUID PRIMARY KEY,
    project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    changed_by UUID REFERENCES users(id) ON DELETE SET NULL,
    from_version INTEGER NOT NULL,
    to_version INTEGER NOT NULL,
    summary JSONB NOT NULL DEFAULT '[]'::jsonb,
    changed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS ix_project_schema_changes_project_id ON project_schema_changes(project_id);
CREATE INDEX IF NOT EXISTS ix_project_schema_changes_changed_by ON project_schema_changes(changed_by);
CREATE INDEX IF NOT EXISTS ix_project_schema_changes_changed_at ON project_schema_changes(changed_at);
