-- Adds a free-text title to entries, independent of any project's schema,
-- so an entry can be identified (in a list, in a link picker) without
-- concatenating whatever its first couple of fields happen to hold.
ALTER TABLE entries ADD COLUMN IF NOT EXISTS title VARCHAR(255);
