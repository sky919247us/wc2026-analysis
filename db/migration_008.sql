-- 進球分析資料庫：每場的上/下半場、加時、PK 進球分解（2022 + 2026）
CREATE TABLE IF NOT EXISTS match_goals (
  id TEXT PRIMARY KEY,          -- y2022-<n> / y2026-<fdid>
  year INTEGER NOT NULL,        -- 2022 / 2026
  stage_type TEXT NOT NULL,     -- group / knockout
  round TEXT,                   -- 小組賽 / 16強 / 決賽 ...
  home_id TEXT, away_id TEXT,   -- tla（跨屆篩選用）
  home_zh TEXT, away_zh TEXT,
  h1_h INTEGER, h1_a INTEGER,   -- 上半場
  h2_h INTEGER, h2_a INTEGER,   -- 下半場
  reg_h INTEGER, reg_a INTEGER, -- 90 分鐘全場
  et_h INTEGER, et_a INTEGER,   -- 加時進球（可為 NULL）
  pen_h INTEGER, pen_a INTEGER, -- PK 進球數（可為 NULL）
  status TEXT
);
CREATE INDEX IF NOT EXISTS idx_mg_year ON match_goals(year);
CREATE INDEX IF NOT EXISTS idx_mg_teams ON match_goals(home_id, away_id);
