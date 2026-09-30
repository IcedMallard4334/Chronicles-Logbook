-- Entry history & corrections (US-3.10).
-- main.py applies the same statements on startup; this file documents them.

-- Deleting an entry stamps it rather than removing the row, so the deletion
-- is itself a version and can be reverted.
ALTER TABLE entries ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
CREATE INDEX IF NOT EXISTS ix_entries_deleted_at ON entries(deleted_at);

-- What each version did, why, and which values it changed.
ALTER TABLE entry_revisions ADD COLUMN IF NOT EXISTS action VARCHAR(20) NOT NULL DEFAULT 'edited';
ALTER TABLE entry_revisions ADD COLUMN IF NOT EXISTS note TEXT;
ALTER TABLE entry_revisions ADD COLUMN IF NOT EXISTS changed_fields JSONB NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE entry_revisions ADD COLUMN IF NOT EXISTS previous_values JSONB NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE entry_revisions ADD COLUMN IF NOT EXISTS reverted_to INTEGER;

UPDATE entry_revisions SET action = 'created' WHERE revision = 1 AND action = 'edited';

-- Entries with no history at all (created before 010 ran, or imported) get
-- their current state as v1.
INSERT INTO entry_revisions (
    id, entry_id, revision, title, data, retired_data, schema_version,
    schema_snapshot, time_spent, todo, due_date, changed_by, changed_at, action
)
SELECT
    md5(e.id::text || '-entry-history-baseline')::uuid, e.id, 1, e.title, e.data,
    e.retired_data, e.schema_version, e.schema_snapshot, e.time_spent, e.todo,
    e.due_date, e.created_by, COALESCE(e.updated_at, e.created_at), 'created'
FROM entries e
WHERE NOT EXISTS (SELECT 1 FROM entry_revisions r WHERE r.entry_id = e.id)
ON CONFLICT DO NOTHING;
