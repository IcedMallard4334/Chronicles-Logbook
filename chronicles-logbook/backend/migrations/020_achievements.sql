-- Badges a user has earned. A new table, so main.py's create_all builds it on
-- startup; this file documents the shape.
CREATE TABLE IF NOT EXISTS user_achievements (
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    key VARCHAR(60) NOT NULL,
    earned_at TIMESTAMPTZ NOT NULL,
    seen BOOLEAN NOT NULL DEFAULT FALSE,
    PRIMARY KEY (user_id, key)
);
