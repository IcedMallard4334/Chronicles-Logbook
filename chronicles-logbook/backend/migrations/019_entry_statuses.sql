-- Customisable entry statuses. main.py applies the same statements on startup.
ALTER TABLE projects ADD COLUMN IF NOT EXISTS statuses JSONB NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE entries ADD COLUMN IF NOT EXISTS status VARCHAR(60);
ALTER TABLE entry_revisions ADD COLUMN IF NOT EXISTS status VARCHAR(60);
UPDATE entries SET status = CASE WHEN todo THEN 'Still to do' ELSE 'Done' END WHERE status IS NULL;
