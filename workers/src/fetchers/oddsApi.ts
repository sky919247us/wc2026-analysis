/**
 * The Odds API 國際盤抓取（輔助資料源）
 * - 只抓世界盃 (soccer_fifa_world_cup)、只抓 pinnacle + bet365、h2h + totals
 *   → 每次呼叫成本低，500 credits/月免費額度夠用
 * - Pinnacle 賠率之後在 EV 計算中作為「真實機率」基準
 */
import type { Env } from "../env";
import { detectMovement } from "../models/movement";
import { NAME_TO_TLA } from "./teamNames";

const SPORT = "soccer_fifa_world_cup";
const BOOKMAKERS = "pinnacle,bet365";

export async function syncIntlOdds(env: Env): Promise<{ inserted: number; skipped: string[] }> {
  if (!env.ODDS_API_KEY) throw new Error("ODDS_API_KEY not set");

  const url = `https://api.the-odds-api.com/v4/sports/${SPORT}/odds?regions=eu&markets=h2h,totals&bookmakers=${BOOKMAKERS}&oddsFormat=decimal&apiKey=${env.ODDS_API_KEY}`;
  const res = await fetch(url, { signal: AbortSignal.timeout(30_000) });
  if (!res.ok) throw new Error(`odds-api ${res.status}: ${await res.text()}`);
  const events = (await res.json()) as any[];

  // 把 odds-api 的隊名配對到我們的 match：同兩隊 + 開賽時間誤差 < 2 小時
  const { results: upcoming } = await env.DB.prepare(
    `SELECT id, home_id, away_id, kickoff_utc FROM matches WHERE status != 'FINISHED'`,
  ).all<{ id: string; home_id: string; away_id: string; kickoff_utc: string }>();

  const now = new Date().toISOString();
  const stmts: D1PreparedStatement[] = [];
  const skipped: string[] = [];
  const touched = new Set<string>();

  for (const ev of events) {
    const homeTla = NAME_TO_TLA[ev.home_team];
    const awayTla = NAME_TO_TLA[ev.away_team];
    if (!homeTla || !awayTla) { skipped.push(`${ev.home_team} vs ${ev.away_team}`); continue; }

    const match = (upcoming ?? []).find(
      (m) =>
        m.home_id === homeTla && m.away_id === awayTla &&
        Math.abs(new Date(m.kickoff_utc).getTime() - new Date(ev.commence_time).getTime()) < 2 * 3600_000,
    );
    if (!match) { skipped.push(`${ev.home_team} vs ${ev.away_team} (no fixture)`); continue; }
    touched.add(match.id);

    for (const bm of ev.bookmakers ?? []) {
      for (const market of bm.markets ?? []) {
        if (market.key === "h2h") {
          for (const o of market.outcomes ?? []) {
            const sel = o.name === ev.home_team ? "home" : o.name === ev.away_team ? "away" : "draw";
            stmts.push(insertSnap(env, match.id, bm.key, "1x2", null, sel, o.price, now));
          }
        } else if (market.key === "totals") {
          for (const o of market.outcomes ?? []) {
            stmts.push(insertSnap(env, match.id, bm.key, "total", o.point, o.name.toLowerCase(), o.price, now));
          }
        }
      }
    }
  }

  for (let i = 0; i < stmts.length; i += 50) await env.DB.batch(stmts.slice(i, i + 50));
  await env.CACHE.put("odds:lastSync", now);
  for (const source of ["pinnacle", "bet365"]) await detectMovement(env, source, [...touched]);

  return { inserted: stmts.length, skipped };
}

function insertSnap(
  env: Env, matchId: string, source: string, market: string,
  line: number | null, selection: string, odds: number, at: string,
): D1PreparedStatement {
  return env.DB.prepare(
    `INSERT INTO odds_snapshots (match_id, source, market, line, selection, odds, captured_at)
     VALUES (?1,?2,?3,?4,?5,?6,?7)`,
  ).bind(matchId, source, market, line, selection, odds, at);
}
