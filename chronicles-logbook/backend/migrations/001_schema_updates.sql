-- Chronicles Azure PostgreSQL schema update
-- Run this against your Azure Database for PostgreSQL Flexible Server instance
-- before deploying the latest application code.
--
-- All statements are idempotent (use IF NOT EXISTS / IF EXISTS guards) so they
-- can be re-run safely.

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ---------------------------------------------------------------------------
-- 1. Core tables (only created if they do not already exist)
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    google_sub VARCHAR(255) NOT NULL UNIQUE,
    full_name VARCHAR(100) NOT NULL,
    email VARCHAR(320) NOT NULL UNIQUE,
    avatar_url VARCHAR(2048),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS projects (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    description VARCHAR,
    entry_schema JSONB NOT NULL DEFAULT '[]'::jsonb,
    archived BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS entries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    data JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS tasks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    title VARCHAR(255) NOT NULL,
    description VARCHAR,
    due_date DATE,
    completed BOOLEAN NOT NULL DEFAULT FALSE,
    checklist JSONB NOT NULL DEFAULT '[]'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ---------------------------------------------------------------------------
-- 2. Recent feature columns (safe to run on an existing database)
-- ---------------------------------------------------------------------------

ALTER TABLE entries
    ADD COLUMN IF NOT EXISTS time_spent INTEGER;

ALTER TABLE tasks
    ADD COLUMN IF NOT EXISTS checklist JSONB NOT NULL DEFAULT '[]'::jsonb;

-- ---------------------------------------------------------------------------
-- 3. Password authentication tables
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS password_credentials (
    user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    password_hash VARCHAR(512) NOT NULL
);

CREATE TABLE IF NOT EXISTS password_reset_tokens (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_hash VARCHAR(64) NOT NULL UNIQUE,
    expires_at TIMESTAMPTZ NOT NULL,
    used_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_password_reset_tokens_user_id
    ON password_reset_tokens(user_id);

-- ---------------------------------------------------------------------------
-- 4. Backwards-compatibility renames for older deployments
--    Only runs if the old column names are still present.
-- ---------------------------------------------------------------------------

DO $$
BEGIN
    -- Old users table used google_id / display_name
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'users' AND column_name = 'google_id'
    ) THEN
        ALTER TABLE users RENAME COLUMN google_id TO google_sub;
    END IF;

    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'users' AND column_name = 'display_name'
    ) THEN
        ALTER TABLE users RENAME COLUMN display_name TO full_name;
    END IF;

    -- Old projects table used title / owner_id / archived_at
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'projects' AND column_name = 'title'
    ) THEN
        ALTER TABLE projects RENAME COLUMN title TO name;
    END IF;

    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'projects' AND column_name = 'owner_id'
    ) THEN
        ALTER TABLE projects RENAME COLUMN owner_id TO user_id;
    END IF;

    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'projects' AND column_name = 'archived_at'
    ) THEN
        ALTER TABLE projects ADD COLUMN archived BOOLEAN NOT NULL DEFAULT FALSE;
        UPDATE projects SET archived = TRUE WHERE archived_at IS NOT NULL;
        ALTER TABLE projects DROP COLUMN archived_at;
    END IF;

    -- Old entries table used entry_date
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'entries' AND column_name = 'entry_date'
    ) THEN
        ALTER TABLE entries DROP COLUMN entry_date;
    END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 5. Helpful indexes
-- ---------------------------------------------------------------------------

CREATE INDEX IF NOT EXISTS idx_entries_project_id ON entries(project_id);
CREATE INDEX IF NOT EXISTS idx_tasks_project_id ON tasks(project_id);
CREATE INDEX IF NOT EXISTS idx_projects_user_id ON projects(user_id);
CREATE INDEX IF NOT EXISTS idx_users_google_sub ON users(google_sub);
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
