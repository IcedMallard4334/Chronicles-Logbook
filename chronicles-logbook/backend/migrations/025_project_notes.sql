-- Notes on a project: private to the author or shared with the team.
--
-- A new table and no change to any existing one, so the app's startup `create_all` also
-- builds it; this file records the exact DDL for reviewers and for applying by hand.

CREATE TABLE IF NOT EXISTS project_notes (
    id UUID PRIMARY KEY,
    project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    author_id UUID REFERENCES users(id) ON DELETE SET NULL,
    body TEXT NOT NULL,
    visibility VARCHAR(10) NOT NULL DEFAULT 'private',
    pinned BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS ix_project_notes_project_id ON project_notes(project_id);
CREATE INDEX IF NOT EXISTS ix_project_notes_author_id ON project_notes(author_id);
