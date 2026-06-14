/**
 * 預測產生器：對未開賽比賽跑融合模型，結果存 predictions 表。
 * 若該場有 Pinnacle 最新 1x2 快照，納入市場信號。
 */
import type { Env } from "../env";
import { fuse } from "./fusion";
import { rankToElo } from "./elo";

interface MatchRow {
  id: string; home_id: string; away_id: string;
  elo_home: number | null; elo_away: number | null;
  rank_home: number | null; rank_away: number | null;
}

export async function runPredictions(env: Env): Promise<number> {
  const { results: matches } = await env.DB.prepare(
    `SELECT m.id, m.home_id, m.away_id,
            h.elo AS elo_home, a.elo AS elo_away,
            h.fifa_rank AS rank_home, a.fifa_rank AS rank_away
     FROM matches m
     JOIN teams h ON h.id = m.home_id
     JOIN teams a ON a.id = m.away_id
     WHERE m.status != 'FINISHED'`,
  ).all<MatchRow>();

  let count = 0;
  for (const m of matches ?? []) {
    const eloHome = m.elo_home && m.elo_home !== 1500 ? m.elo_home : rankToElo(m.rank_home);
    const eloAway = m.elo_away && m.elo_away !== 1500 ? m.elo_away : rankToElo(m.rank_away);

    // 取該場 Pinnacle 最新 1x2 作市場信號
    const { results: pin } = await env.DB.prepare(
      `SELECT selection, odds FROM odds_snapshots
       WHERE match_id = ?1 AND source = 'pinnacle' AND market = '1x2'
       ORDER BY captured_at DESC LIMIT 3`,
    ).bind(m.id).all<{ selection: string; odds: number }>();
    const pm = Object.fromEntries((pin ?? []).map((r) => [r.selection, r.odds]));
    const marketOdds = pm.home && pm.draw && pm.away
      ? { home: pm.home, draw: pm.draw, away: pm.away } : undefined;

    const r = fuse({ eloHome, eloAway, marketOdds });

    await env.DB.prepare(
      `INSERT INTO predictions
         (match_id, prob_home, prob_draw, prob_away, xg_home, xg_away,
          confidence, upset_index, risk_grade, best_market, best_ev, detail_json)
       VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12)`,
    ).bind(
      m.id, r.fused.home, r.fused.draw, r.fused.away,
      r.poissonDetail.xgHome, r.poissonDetail.xgAway,
      r.confidence, r.upsetIndex, r.riskGrade,
      null, null, JSON.stringify(r),
    ).run();
    count++;
  }
  await env.CACHE.put("predict:lastSync", new Date().toISOString());
  return count;
}
