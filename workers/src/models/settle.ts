/**
 * 賽後對帳：對已完賽、尚未對帳的比賽，
 * 取「開賽前最後一筆預測」的推薦方向 vs 實際結果，
 * 記錄命中與否 + 平準注（1 注）損益到 track_record。
 *
 * 推薦方向 = 融合機率最高的一邊（主/平/客）。
 * 損益：命中 → +(該方向賠率 - 1)；未命中 → -1。
 *   賠率優先用台灣運彩，無則用 Pinnacle，再無則用融合機率倒數（無水位估算）。
 */
import type { Env } from "../env";
import { updateElo } from "./elo";

interface FinishedMatch {
  id: string; home_id: string; away_id: string;
  home_score: number; away_score: number;
  kickoff_utc: string;
}

export async function settleMatches(env: Env): Promise<{ settled: number; eloUpdated: number }> {
  // 已完賽、有比分、且還沒對帳的
  const { results: matches } = await env.DB.prepare(
    `SELECT m.id, m.home_id, m.away_id, m.home_score, m.away_score, m.kickoff_utc
     FROM matches m
     LEFT JOIN track_record tr ON tr.match_id = m.id
     WHERE m.status = 'FINISHED' AND m.home_score IS NOT NULL AND tr.match_id IS NULL`,
  ).all<FinishedMatch>();

  let settled = 0, eloUpdated = 0;

  for (const m of matches ?? []) {
    const actual = m.home_score > m.away_score ? "home"
      : m.home_score < m.away_score ? "away" : "draw";

    // 開賽前最後一筆預測
    const pred = await env.DB.prepare(
      `SELECT prob_home, prob_draw, prob_away FROM predictions
       WHERE match_id = ?1 AND created_at <= ?2
       ORDER BY created_at DESC LIMIT 1`,
    ).bind(m.id, m.kickoff_utc).first<{ prob_home: number; prob_draw: number; prob_away: number }>();

    if (pred) {
      const probs = { home: pred.prob_home, draw: pred.prob_draw, away: pred.prob_away };
      const rec = (Object.keys(probs) as (keyof typeof probs)[])
        .reduce((a, b) => (probs[b] > probs[a] ? b : a));

      // 只記錄「有真實 TW/Pinnacle 賠率」的場次：用真實早盤賠率算損益、收盤算 CLV。
      // 沒有真實盤 → 不記入戰績（避免用模型推算賠率污染公開戰績），但仍更新 Elo。
      const { entry, closing } = await entryClosingOdds(env, m.id, rec, m.kickoff_utc);
      if (entry && closing) {
        const hit = rec === actual ? 1 : 0;
        const profit = hit ? +(entry - 1).toFixed(2) : -1;
        const clv = +((entry / closing - 1) * 100).toFixed(2);
        await env.DB.prepare(
          `INSERT INTO track_record (match_id, recommended_market, recommended_odds, ev_at_recommend, hit, profit_units, closing_odds, clv, settled_at)
           VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, datetime('now'))`,
        ).bind(m.id, rec, entry, null, hit, profit, closing, clv).run();
        settled++;
      }
    }

    // 完賽後更新兩隊 Elo（供後續比賽用真實表現修正）
    const result = actual === "home" ? 1 : actual === "away" ? 0 : 0.5;
    const teams = await env.DB.prepare(
      `SELECT h.elo AS eh, a.elo AS ea FROM matches mm
       JOIN teams h ON h.id = mm.home_id JOIN teams a ON a.id = mm.away_id WHERE mm.id = ?1`,
    ).bind(m.id).first<{ eh: number; ea: number }>();
    if (teams) {
      const nu = updateElo(teams.eh, teams.ea, result);
      await env.DB.batch([
        env.DB.prepare(`UPDATE teams SET elo = ?1 WHERE id = ?2`).bind(nu.home, m.home_id),
        env.DB.prepare(`UPDATE teams SET elo = ?1 WHERE id = ?2`).bind(nu.away, m.away_id),
      ]);
      eloUpdated++;
    }
  }

  await env.CACHE.put("settle:lastRun", new Date().toISOString());
  return { settled, eloUpdated };
}

/** 該選項的早盤（最早）與收盤（開賽前最後）賠率，來源優先 tw > pinnacle */
async function entryClosingOdds(env: Env, matchId: string, sel: string, kickoff: string): Promise<{ entry: number | null; closing: number | null }> {
  for (const source of ["tw", "pinnacle"]) {
    const { results } = await env.DB.prepare(
      `SELECT odds, captured_at FROM odds_snapshots
       WHERE match_id = ?1 AND source = ?2 AND market = '1x2' AND selection = ?3 AND captured_at <= ?4
       ORDER BY captured_at ASC`,
    ).bind(matchId, source, sel, kickoff).all<{ odds: number; captured_at: string }>();
    if (results && results.length) return { entry: results[0].odds, closing: results[results.length - 1].odds };
  }
  return { entry: null, closing: null };
}
