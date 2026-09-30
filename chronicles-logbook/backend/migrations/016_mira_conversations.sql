-- Saved Mira conversations. New tables, so main.py's create_all builds them on
-- startup; this file documents the shape.
CREATE TABLE IF NOT EXISTS mira_conversations (
    id UUID PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    title VARCHAR(120) NOT NULL DEFAULT 'New conversation',
    created_at TIMESTAMPTZ NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL
);
CREATE INDEX IF NOT EXISTS ix_mira_conversations_user_id ON mira_conversations(user_id);

CREATE TABLE IF NOT EXISTS mira_messages (
    id UUID PRIMARY KEY,
    conversation_id UUID NOT NULL REFERENCES mira_conversations(id) ON DELETE CASCADE,
    role VARCHAR(12) NOT NULL,
    content TEXT NOT NULL,
    thinking TEXT,
    created_at TIMESTAMPTZ NOT NULL
);
CREATE INDEX IF NOT EXISTS ix_mira_messages_conversation_id ON mira_messages(conversation_id);
