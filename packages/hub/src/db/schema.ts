// SQLite table definitions via better-sqlite3

export const CREATE_NODES_TABLE = `
  CREATE TABLE IF NOT EXISTS nodes (
    node_id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'offline',
    os TEXT NOT NULL DEFAULT '',
    arch TEXT NOT NULL DEFAULT '',
    hostname TEXT NOT NULL DEFAULT '',
    cpu REAL NOT NULL DEFAULT 0,
    mem_total INTEGER NOT NULL DEFAULT 0,
    mem_used INTEGER NOT NULL DEFAULT 0,
    disk_total INTEGER NOT NULL DEFAULT 0,
    disk_used INTEGER NOT NULL DEFAULT 0,
    active_sessions INTEGER NOT NULL DEFAULT 0,
    last_seen INTEGER NOT NULL DEFAULT 0
  )
`;

export const CREATE_SESSIONS_TABLE = `
  CREATE TABLE IF NOT EXISTS sessions (
    session_id TEXT PRIMARY KEY,
    node_id TEXT NOT NULL,
    label TEXT NOT NULL DEFAULT '',
    cwd TEXT NOT NULL DEFAULT '',
    created_at INTEGER NOT NULL,
    last_active INTEGER NOT NULL,
    status TEXT NOT NULL DEFAULT 'active'
  )
`;

export const MIGRATE_SESSIONS_ADD_LABEL = `
  ALTER TABLE sessions ADD COLUMN label TEXT NOT NULL DEFAULT ''
`;

export const CREATE_AUTH_TOKENS_TABLE = `
  CREATE TABLE IF NOT EXISTS auth_tokens (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    token_hash TEXT NOT NULL UNIQUE,
    label TEXT NOT NULL DEFAULT '',
    created_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000)
  )
`;
