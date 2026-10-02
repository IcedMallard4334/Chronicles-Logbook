-- Automations can wait for an entry to reach a status, and can add tasks and repeats.
-- main.py applies the same statements on startup; this file documents them.
ALTER TABLE entry_rules ADD COLUMN IF NOT EXISTS trigger VARCHAR(10) NOT NULL DEFAULT 'created';
ALTER TABLE entry_rules ADD COLUMN IF NOT EXISTS trigger_status VARCHAR(40);
