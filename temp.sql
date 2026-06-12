CREATE TABLE IF NOT EXISTS match_stats (
    match_id INTEGER NOT NULL,
    team_name TEXT NOT NULL,
    possession_pct REAL DEFAULT 0,
    shots_total INTEGER DEFAULT 0,
    shots_on_target INTEGER DEFAULT 0,
    corners INTEGER DEFAULT 0,
    offsides INTEGER DEFAULT 0,
    fouls INTEGER DEFAULT 0,
    saves INTEGER DEFAULT 0,
    PRIMARY KEY (match_id, team_name),
    FOREIGN KEY(match_id) REFERENCES matches(id),
    FOREIGN KEY(team_name) REFERENCES teams(name)
);
