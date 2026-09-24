-- Chronicles: sharing becomes an invitation rather than a grant
--
-- project_members used to mean "has access". It now means "has been asked",
-- with `status` saying whether they took it up. Nothing appears in an
-- invitee's workspace until they accept, and they can leave afterwards.
--
-- The default is deliberately 'accepted', not 'pending': every row that
-- already exists was written under the old rules and already grants access.
-- Defaulting to 'pending' would silently revoke every shared project from
-- the people currently collaborating on one, and make them ask to be let
-- back into work they have been contributing to.
--
-- All statements are idempotent and safe to run repeatedly on local
-- PostgreSQL and Azure PostgreSQL.

ALTER TABLE project_members
    ADD COLUMN IF NOT EXISTS status VARCHAR(20) NOT NULL DEFAULT 'accepted';

ALTER TABLE project_members
    ADD COLUMN IF NOT EXISTS invited_by UUID REFERENCES users(id) ON DELETE SET NULL;

ALTER TABLE project_members
    ADD COLUMN IF NOT EXISTS responded_at TIMESTAMPTZ;

-- The invitations list and the membership check both filter on status, and
-- both run on every page load of a shared workspace.
CREATE INDEX IF NOT EXISTS idx_project_members_user_status
    ON project_members(user_id, status);
