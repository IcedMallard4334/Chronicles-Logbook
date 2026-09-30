-- Time of day for a to-do entry's deadline (optional; only meaningful with a due date).
-- main.py applies the same statements on startup; this file documents them.
ALTER TABLE entries ADD COLUMN IF NOT EXISTS due_time TIME;
ALTER TABLE entry_revisions ADD COLUMN IF NOT EXISTS due_time TIME;
