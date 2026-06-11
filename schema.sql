CREATE TABLE IF NOT EXISTS teams (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    name_normalised TEXT NOT NULL UNIQUE,
    fifa_code TEXT NOT NULL UNIQUE,
    flag_icon TEXT NOT NULL,
    group_name TEXT NOT NULL,
    continent TEXT NOT NULL,
    confed TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS stadiums (
    name TEXT PRIMARY KEY,
    city TEXT NOT NULL,
    timezone TEXT NOT NULL,
    cc TEXT NOT NULL,
    capacity INTEGER NOT NULL,
    coords TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS matches (
    id INTEGER PRIMARY KEY,
    round TEXT NOT NULL,
    date TEXT NOT NULL,
    time_str TEXT NOT NULL,
    kickoff_utc INTEGER NOT NULL,
    team1_name TEXT NOT NULL,
    team2_name TEXT NOT NULL,
    score_team1 INTEGER DEFAULT NULL,
    score_team2 INTEGER DEFAULT NULL,
    score_pen_team1 INTEGER DEFAULT NULL,
    score_pen_team2 INTEGER DEFAULT NULL,
    status TEXT NOT NULL,
    ground TEXT NOT NULL,
    last_updated INTEGER DEFAULT NULL,
    FOREIGN KEY(team1_name) REFERENCES teams(name),
    FOREIGN KEY(team2_name) REFERENCES teams(name),
    FOREIGN KEY(ground) REFERENCES stadiums(name)
);

CREATE TABLE IF NOT EXISTS match_events (
    id TEXT PRIMARY KEY,
    match_id INTEGER NOT NULL,
    type TEXT NOT NULL,
    minute INTEGER NOT NULL,
    player_name TEXT NOT NULL,
    team_name TEXT NOT NULL,
    detail TEXT,
    created_at INTEGER NOT NULL,
    FOREIGN KEY(match_id) REFERENCES matches(id)
);

CREATE TABLE IF NOT EXISTS standings (
    group_name TEXT NOT NULL,
    team_name TEXT NOT NULL,
    played INTEGER DEFAULT 0,
    wins INTEGER DEFAULT 0,
    draws INTEGER DEFAULT 0,
    losses INTEGER DEFAULT 0,
    goals_for INTEGER DEFAULT 0,
    goals_against INTEGER DEFAULT 0,
    goal_difference INTEGER DEFAULT 0,
    points INTEGER DEFAULT 0,
    PRIMARY KEY (group_name, team_name),
    FOREIGN KEY(team_name) REFERENCES teams(name)
);

CREATE TABLE IF NOT EXISTS top_scorers (
    player_name TEXT PRIMARY KEY,
    team_name TEXT NOT NULL,
    goals INTEGER DEFAULT 0,
    assists INTEGER DEFAULT 0,
    FOREIGN KEY(team_name) REFERENCES teams(name)
);

CREATE TABLE IF NOT EXISTS subscriptions (
    chat_id INTEGER PRIMARY KEY,
    chat_type TEXT NOT NULL,
    chat_title TEXT,
    subscribed_at INTEGER NOT NULL,
    is_active INTEGER DEFAULT 1,
    timezone TEXT DEFAULT 'UTC'
);

CREATE TABLE IF NOT EXISTS sent_notifications (
    id TEXT PRIMARY KEY,
    sent_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS inline_users (
    user_id INTEGER PRIMARY KEY,
    username TEXT,
    first_name TEXT,
    last_used_at INTEGER NOT NULL,
    usage_count INTEGER DEFAULT 1
);
