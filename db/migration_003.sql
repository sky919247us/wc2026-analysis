-- 正確比數預測戰績 + 結算旗標（修正無賠率場次重複更新 Elo 的問題）

ALTER TABLE matches ADD COLUMN settled INTEGER DEFAULT 0;
-- 既有完賽場標記為已結算，避免新邏輯重複處理（Elo 不重算）
UPDATE matches SET settled = 1 WHERE status = 'FINISHED';

-- 正確比數預測對帳：Poisson 前 4 比分，任一命中即算中
CREATE TABLE IF NOT EXISTS score_record (
  match_id TEXT PRIMARY KEY REFERENCES matches(id),
  predicted TEXT,        -- 預測的前 4 比分，逗號分隔，如 "1-1,2-1,1-0,2-0"
  actual TEXT,           -- 實際比分 "H-A"
  hit INTEGER,           -- 1 任一命中 / 0 皆未中
  settled_at TEXT NOT NULL DEFAULT (datetime('now'))
);
