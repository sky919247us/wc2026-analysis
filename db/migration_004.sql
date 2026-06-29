-- 球員名單（football-data /competitions/WC/teams 的 squad，免費層即有）
CREATE TABLE IF NOT EXISTS players (
  id TEXT PRIMARY KEY,          -- football-data person id
  team_id TEXT REFERENCES teams(id),
  name TEXT NOT NULL,           -- 英文顯示名
  position TEXT,                -- 原始位置（Goalkeeper/Centre-Back/Midfield...）
  dob TEXT,                     -- 生日 YYYY-MM-DD
  nationality TEXT
);
CREATE INDEX IF NOT EXISTS idx_players_team ON players(team_id);
