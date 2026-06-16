-- 加入 CLV（收盤線價值）欄位 + 冠軍盤表

-- 戰績對帳：記錄收盤賠率與 CLV
ALTER TABLE track_record ADD COLUMN closing_odds REAL;
ALTER TABLE track_record ADD COLUMN clv REAL;  -- 推薦賠率 / 收盤賠率 - 1，正值=贏過收盤線

-- 冠軍盤（outright）：不綁單場，獨立記錄各隊奪冠賠率
CREATE TABLE IF NOT EXISTS outright_odds (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  source TEXT NOT NULL,           -- tw / pinnacle
  team_id TEXT NOT NULL,
  odds REAL NOT NULL,
  captured_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_outright ON outright_odds(team_id, source, captured_at);
