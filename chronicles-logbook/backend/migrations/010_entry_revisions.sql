CREATE TABLE IF NOT EXISTS entry_revisions (
    id UUID PRIMARY KEY,
    entry_id UUID NOT NULL REFERENCES entries(id) ON DELETE CASCADE,
    revision INTEGER NOT NULL,
    title VARCHAR(255),
    data JSONB NOT NULL DEFAULT '{}'::jsonb,
    retired_data JSONB NOT NULL DEFAULT '{}'::jsonb,
    schema_version INTEGER NOT NULL,
    schema_snapshot JSONB NOT NULL DEFAULT '[]'::jsonb,
    time_spent INTEGER,
    todo BOOLEAN NOT NULL DEFAULT false,
    due_date DATE,
    changed_by UUID REFERENCES users(id) ON DELETE SET NULL,
    changed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_entry_revisions_entry_revision UNIQUE (entry_id, revision)
);

CREATE INDEX IF NOT EXISTS ix_entry_revisions_entry_id ON entry_revisions(entry_id);

-- Existing entries predate the audit table. Give each one a baseline so its
-- current recorded state is still visible when history is first introduced.
INSERT INTO entry_revisions (
    id, entry_id, revision, title, data, retired_data, schema_version,
    schema_snapshot, time_spent, todo, due_date, changed_by, changed_at
)
SELECT
    md5(id::text || '-entry-history-baseline')::uuid, id, 1, title, data, retired_data, schema_version,
    schema_snapshot, time_spent, todo, due_date, created_by, updated_at
FROM entries
ON CONFLICT (entry_id, revision) DO NOTHING;
