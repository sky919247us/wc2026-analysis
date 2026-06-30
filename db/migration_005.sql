-- 點球大戰比分（淘汰賽平手後 PK 決勝）。home_score/away_score 改存正賽+延長賽比分（如 1:1）
ALTER TABLE matches ADD COLUMN home_pens INTEGER;
ALTER TABLE matches ADD COLUMN away_pens INTEGER;
