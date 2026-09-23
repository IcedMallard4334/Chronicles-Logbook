-- Chronicles: shared projects (US-2.20)
--
-- A project belongs to the user in projects.user_id. This table records the
-- other people that owner has shared it with. Membership grants reading the
-- project and adding entries to it; editing the schema, archiving, deleting,
-- exporting and changing who else has access all remain with the owner.
--
-- Both foreign keys cascade: deleting a project or a user removes the
-- membership rather than leaving a row pointing at nothing.
--
-- All statements are idempotent and safe to run repeatedly on local
-- PostgreSQL and Azure PostgreSQL.

CREATE TABLE IF NOT EXISTS project_members (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_project_members_project_user UNIQUE (project_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_project_members_project_id ON project_members(project_id);
CREATE INDEX IF NOT EXISTS idx_project_members_user_id ON project_members(user_id);
