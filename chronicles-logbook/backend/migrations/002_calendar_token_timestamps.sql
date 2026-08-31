-- PostgreSQL deployments: align Calendar connection metadata with the model.
ALTER TABLE google_calendar_tokens
    ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
ALTER TABLE google_calendar_tokens
    ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
