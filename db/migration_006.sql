-- 淘汰賽決勝方（含 PK）。football-data 的 winner 欄最權威，用來判晉級，避免 PK 比分
-- 進行中暫時平手導致判不出勝方。HOME / AWAY / DRAW。
ALTER TABLE matches ADD COLUMN winner TEXT;
