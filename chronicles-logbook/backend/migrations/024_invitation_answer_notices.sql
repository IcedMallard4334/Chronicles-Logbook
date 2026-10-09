-- The owner is told when an invitation is answered, until they dismiss the notice.
--
-- One nullable column. main.py applies the same statement on startup; this file
-- documents it. Null means "not dismissed yet"; the API only offers answers from
-- the last 14 days, so older answers never arrive as notices.
ALTER TABLE project_members ADD COLUMN IF NOT EXISTS owner_seen_at TIMESTAMPTZ;
