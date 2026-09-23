-- Persistent Google login sessions used by /auth/refresh.
-- Safe to run repeatedly on local PostgreSQL and Azure PostgreSQL.

CREATE TABLE IF NOT EXISTS login_sessions (
    token_hash VARCHAR(64) PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    expires_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_login_sessions_user_id
    ON login_sessions(user_id);
