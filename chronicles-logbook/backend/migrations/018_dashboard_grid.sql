-- Dashboard grid: how many blocks wide it is. Each panel's own size (w, h) lives
-- inside the panels JSON. main.py applies the same statement on startup.
ALTER TABLE dashboards ADD COLUMN IF NOT EXISTS columns INTEGER NOT NULL DEFAULT 3;
