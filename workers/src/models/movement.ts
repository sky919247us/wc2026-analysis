/**
 * 盤口異動偵測：比對同 source/market/selection 的最新 vs 前一筆快照，
 * 觸發規則寫入 odds_alerts。
 */
import type { Env } from "../env";
import { broadcast, formatAlert } from "../notify/telegram";

interface SnapshotRow {
  match_id: string;
  market: string;
  selection: string;
  odds: number;
  captured_at: string;
}

const DROP_PCT = 0.03; // 單邊降幅 3% 即視為顯著

export async function detectMovement(env: Env, source: string, matchIds: string[]): Promise<number> {
  if (!matchIds.length) return 0;
  let alerts = 0;

  for (const matchId of matchIds) {
    // 取該場該來源最近兩個時間點的 1x2 快照
    const { results } = await env.DB.prepare(
      `SELECT match_id, market, selection, odds, captured_at
       FROM odds_snapshots
       WHERE match_id = ?1 AND source = ?2 AND market = '1x2'
       ORDER BY captured_at DESC LIMIT 12`,
    ).bind(matchId, source).all<SnapshotRow>();

    const byTime = new Map<string, Map<string, number>>();
    for (const r of results ?? []) {
      if (!byTime.has(r.captured_at)) byTime.set(r.captured_at, new Map());
      byTime.get(r.captured_at)!.set(r.selection, r.odds);
    }
    const times = [...byTime.keys()];
    if (times.length < 2) continue;
    const [latest, prev] = [byTime.get(times[0])!, byTime.get(times[1])!];

    const drop = (sel: string): number => {
      const a = prev.get(sel), b = latest.get(sel);
      return a && b ? (a - b) / a : 0;
    };

    // 隊名（把 home/draw/away 換成口語的「○○贏 / 和局」）
    const teams = await env.DB.prepare(
      `SELECT h.name_zh AS home_zh, a.name_zh AS away_zh FROM matches m
       JOIN teams h ON h.id = m.home_id JOIN teams a ON a.id = m.away_id WHERE m.id = ?1`,
    ).bind(matchId).first<{ home_zh: string; away_zh: string }>();
    const oc = (sel: string): string =>
      sel === "home" ? `${teams?.home_zh ?? "主隊"}贏` : sel === "away" ? `${teams?.away_zh ?? "客隊"}贏` : "和局";

    // 規則 1：雙向賠率同降（主勝與客勝同時下降）→ 疑似大額資金介入
    if (drop("home") > DROP_PCT && drop("away") > DROP_PCT) {
      await pushAlert(env, matchId, "both_drop", teams,
        `「${oc("home")}」和「${oc("away")}」的賠率同時變低——兩邊都有大錢押注，通常代表有大戶／大額資金進場推動盤口。`,
        Math.min(99, Math.round((drop("home") + drop("away")) * 500)));
      alerts++;
      continue;
    }
    // 規則 2：單邊急降 >6% → 資金湧入一側
    for (const sel of ["home", "draw", "away"]) {
      if (drop(sel) > DROP_PCT * 2) {
        await pushAlert(env, matchId, "sharp_drop", teams,
          `「${oc(sel)}」的賠率短時間內大幅變低（${(drop(sel) * 100).toFixed(0)}%）——代表很多錢押這一邊，莊家調低賠率，市場越來越看好這個結果。`,
          Math.min(99, Math.round(drop(sel) * 800)));
        alerts++;
      }
    }
  }
  return alerts;
}

async function pushAlert(
  env: Env, matchId: string, rule: string,
  teams: { home_zh: string; away_zh: string } | null, detail: string, severity: number,
) {
  await env.DB.prepare(
    `INSERT INTO odds_alerts (match_id, rule, detail, severity) VALUES (?1, ?2, ?3, ?4)`,
  ).bind(matchId, rule, detail, severity).run();

  // Telegram 推播（設了 TELEGRAM_BOT_TOKEN 且有訂閱者才送），只推較顯著的（≥35）
  if (env.TELEGRAM_BOT_TOKEN && severity >= 35 && teams) {
    try { await broadcast(env, formatAlert({ ...teams, detail, severity })); } catch { /* 推播失敗不影響偵測 */ }
  }
}
