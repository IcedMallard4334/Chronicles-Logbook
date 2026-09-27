-- US-3.12: entry rules, recurrence and reminders.
--
-- Three new tables and no change to any existing one, so the app's startup
-- `create_all` also builds these on its own; this file records the exact DDL
-- for reviewers and for applying by hand.

CREATE TABLE IF NOT EXISTS entry_rules (
    id UUID PRIMARY KEY,
    project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    name VARCHAR(100) NOT NULL,
    enabled BOOLEAN NOT NULL DEFAULT true,
    match VARCHAR(3) NOT NULL DEFAULT 'all',
    conditions JSONB NOT NULL DEFAULT '[]'::jsonb,
    actions JSONB NOT NULL DEFAULT '[]'::jsonb,
    created_by UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS ix_entry_rules_project_id ON entry_rules(project_id);

CREATE TABLE IF NOT EXISTS entry_recurrences (
    id UUID PRIMARY KEY,
    entry_id UUID NOT NULL REFERENCES entries(id) ON DELETE CASCADE,
    project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    frequency VARCHAR(10) NOT NULL,
    "interval" INTEGER NOT NULL DEFAULT 1,
    starts_on DATE NOT NULL,
    ends_on DATE,
    next_index INTEGER NOT NULL DEFAULT 1,
    next_on DATE,
    active BOOLEAN NOT NULL DEFAULT true,
    created_by UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_entry_recurrences_entry UNIQUE (entry_id)
);

CREATE INDEX IF NOT EXISTS ix_entry_recurrences_project_id ON entry_recurrences(project_id);
CREATE INDEX IF NOT EXISTS ix_entry_recurrences_next_on ON entry_recurrences(next_on);

-- One row per occurrence already created. The unique (recurrence, date) pair is
-- what stops two simultaneous requests creating the same occurrence twice.
CREATE TABLE IF NOT EXISTS recurrence_occurrences (
    id UUID PRIMARY KEY,
    recurrence_id UUID NOT NULL REFERENCES entry_recurrences(id) ON DELETE CASCADE,
    occurrence_on DATE NOT NULL,
    entry_id UUID REFERENCES entries(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_recurrence_occurrences_date UNIQUE (recurrence_id, occurrence_on)
);

CREATE INDEX IF NOT EXISTS ix_recurrence_occurrences_recurrence_id
    ON recurrence_occurrences(recurrence_id);
