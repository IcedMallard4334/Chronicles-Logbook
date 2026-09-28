-- US-3.7: the per-user Statistics page layout.
--
-- One new table and no change to any existing one, so the app's startup
-- `create_all` also builds it on its own; this file records the exact DDL
-- for reviewers and for applying by hand.

CREATE TABLE IF NOT EXISTS statistics_layouts (
    user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    panels JSONB NOT NULL DEFAULT '[]'::jsonb,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
