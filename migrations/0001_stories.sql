CREATE TABLE IF NOT EXISTS stories (id TEXT PRIMARY KEY, title TEXT NOT NULL DEFAULT 'Untitled', genre TEXT, logline TEXT NOT NULL DEFAULT '', data TEXT NOT NULL DEFAULT '{}', created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL);
CREATE INDEX IF NOT EXISTS stories_updated ON stories(updated_at DESC);
