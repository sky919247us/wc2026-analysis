-- 球員所屬俱樂部（football-data /persons/{id} 的 currentTeam，免費層即有，但每人一次呼叫）
ALTER TABLE players ADD COLUMN club TEXT;          -- 俱樂部短名（如 Inter Miami）
ALTER TABLE players ADD COLUMN club_crest TEXT;    -- 隊徽圖 URL
ALTER TABLE players ADD COLUMN club_league TEXT;   -- 聯賽代碼（PD/PL/MLS...）
ALTER TABLE players ADD COLUMN club_checked INTEGER DEFAULT 0;  -- 已查過（避免無俱樂部者一直重抓）
