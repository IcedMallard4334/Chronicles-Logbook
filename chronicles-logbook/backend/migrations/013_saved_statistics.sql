-- US-3.8: figures the user defines for themselves on the Statistics page.
--
-- A new table and no change to any existing one, so the app's startup
-- `create_all` also builds it on its own; this file records the exact DDL
-- for reviewers and for applying by hand.

CREATE TABLE IF NOT EXISTS saved_statistics (
    id UUID PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    name VARCHAR(100) NOT NULL,
    expression VARCHAR(500) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS ix_saved_statistics_user_id ON saved_statistics(user_id);
CREATE INDEX IF NOT EXISTS ix_saved_statistics_project_id ON saved_statistics(project_id);
