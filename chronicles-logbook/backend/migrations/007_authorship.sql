-- Chronicles: who wrote an entry, and who added and completed a task (US-2.21)
--
-- Once a project can be shared, "what was done" is only half a record — a
-- logbook kept by two people has to say who did which part.
--
-- All three columns are nullable: entries and tasks written before sharing
-- existed have no author, so "unknown" is a real state rather than an error.
-- ON DELETE SET NULL rather than CASCADE, because the record has to outlive the
-- contributor — deleting a collaborator's account must not delete the work they
-- logged in someone else's project.
--
-- All statements are idempotent and safe to run repeatedly on local
-- PostgreSQL and Azure PostgreSQL.

ALTER TABLE entries
    ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES users(id) ON DELETE SET NULL;

ALTER TABLE tasks
    ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES users(id) ON DELETE SET NULL;

ALTER TABLE tasks
    ADD COLUMN IF NOT EXISTS completed_by UUID REFERENCES users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_entries_created_by ON entries(created_by);
CREATE INDEX IF NOT EXISTS idx_tasks_created_by ON tasks(created_by);
CREATE INDEX IF NOT EXISTS idx_tasks_completed_by ON tasks(completed_by);

-- Existing rows belong to the project's owner: before sharing there was nobody
-- else who could have written them. Only fills rows that have no author yet.
UPDATE entries AS e
SET created_by = p.user_id
FROM projects AS p
WHERE e.project_id = p.id
  AND e.created_by IS NULL;

UPDATE tasks AS t
SET created_by = p.user_id
FROM projects AS p
WHERE t.project_id = p.id
  AND t.created_by IS NULL;
