-- Time of day for a task's deadline (optional; only meaningful with a due date).
-- main.py applies the same statement on startup; this file documents it.
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS due_time TIME;
