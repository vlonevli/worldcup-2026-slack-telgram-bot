CREATE TABLE IF NOT EXISTS inline_users (
    user_id INTEGER PRIMARY KEY,
    username TEXT,
    first_name TEXT,
    last_used_at INTEGER NOT NULL,
    usage_count INTEGER DEFAULT 1
);
