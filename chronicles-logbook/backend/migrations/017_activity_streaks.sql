-- Days a user logged in or interacted, for the two daily streaks. A new table,
-- so main.py's create_all builds it on startup; this file documents the shape.
CREATE TABLE IF NOT EXISTS user_activity_days (
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    day DATE NOT NULL,
    kind VARCHAR(12) NOT NULL,
    PRIMARY KEY (user_id, day, kind)
);
