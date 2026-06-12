-- WC2026 D1 schema
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS teams (
  id TEXT PRIMARY KEY,           -- FIFA code: KOR, MEX...
  name_zh TEXT NOT NULL,
  name_en TEXT NOT NULL,
  fifa_rank INTEGER,
  grp TEXT,                      -- A..L
  elo REAL DEFAULT 1500
);

CREATE TABLE IF NOT EXISTS matches (
  id TEXT PRIMARY KEY,
  stage TEXT NOT NULL,           -- GROUP_A, R32, R16, QF, SF, F
  kickoff_utc TEXT NOT NULL,
  home_id TEXT REFERENCES teams(id),
  away_id TEXT REFERENCES teams(id),
  status TEXT DEFAULT 'SCHEDULED',  -- SCHEDULED/LIVE/FINISHED
  home_score INTEGER,
  away_score INTEGER
);

-- 賠率快照：source 區分 'tw'（台灣運彩，主）與 'pinnacle'/'bet365'（輔助）
CREATE TABLE IF NOT EXISTS odds_snapshots (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  match_id TEXT NOT NULL REFERENCES matches(id),
  source TEXT NOT NULL,
  market TEXT NOT NULL,          -- 1x2 / handicap / total / correct_score
  line REAL,                     -- 讓分線或大小球線
  selection TEXT NOT NULL,       -- home/draw/away/over/under/2-1...
  odds REAL NOT NULL,
  captured_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_odds_match ON odds_snapshots(match_id, source, market, captured_at);

-- 異動警報（雙向同降、大額資金等規則觸發）
CREATE TABLE IF NOT EXISTS odds_alerts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  match_id TEXT NOT NULL REFERENCES matches(id),
  rule TEXT NOT NULL,
  detail TEXT,
  severity INTEGER,              -- 0-100
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  notified INTEGER DEFAULT 0
);

-- 模型預測（每次重算存一筆，對帳用最後一筆開賽前的）
CREATE TABLE IF NOT EXISTS predictions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  match_id TEXT NOT NULL REFERENCES matches(id),
  prob_home REAL, prob_draw REAL, prob_away REAL,
  xg_home REAL, xg_away REAL,
  confidence INTEGER, upset_index INTEGER, risk_grade TEXT,
  best_market TEXT,              -- EV 最高的運彩玩法
  best_ev REAL,
  detail_json TEXT,              -- 各模型分項
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- LLM 白話報告（記錄實際供應商，追蹤成本/品質）
CREATE TABLE IF NOT EXISTS reports (
  match_id TEXT PRIMARY KEY REFERENCES matches(id),
  content_md TEXT NOT NULL,
  llm_provider TEXT,
  llm_model TEXT,
  input_tokens INTEGER, output_tokens INTEGER,
  generated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS news (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  source TEXT, title TEXT NOT NULL, url TEXT UNIQUE,
  summary TEXT, lang TEXT, tags TEXT,
  published_at TEXT, fetched_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- 賽後對帳：公開戰績頁的資料來源
CREATE TABLE IF NOT EXISTS track_record (
  match_id TEXT PRIMARY KEY REFERENCES matches(id),
  recommended_market TEXT,
  recommended_odds REAL,
  ev_at_recommend REAL,
  hit INTEGER,                   -- 1 中 / 0 未中
  profit_units REAL,             -- 平準注損益
  settled_at TEXT
);
