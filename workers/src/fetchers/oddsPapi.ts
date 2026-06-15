/**
 * OddsPapi 國際盤抓取（The Odds API 的替代來源，免費含 Pinnacle）
 *   - /fixtures?sportId=10 → 篩 tournamentName == "World Cup"
 *   - /odds?fixtureId=ID&bookmakers=pinnacle,bet365
 *     回應：bookmakerOdds[slug].markets[101].outcomes[101|102|103].players["0"].price
 *           market 101 = 1X2，outcome 101 主 / 102 和 / 103 客
 *
 * ⚠️ 免費額度 250 req/月：/odds 為每場一次呼叫，故只抓「未來 36 小時內開賽」
 *    的少數場次，且建議 cron 一天跑 1-2 次（見 index.ts）。
 */
import type { Env } from "../env";
import { detectMovement } from "../models/movement";

const BASE = "https://api.oddspapi.io/v4";

// OddsPapi 隊名 → 我們的 TLA（與 The Odds API 共用命名習慣，覆蓋主要球隊）
import { NAME_TO_TLA } from "./teamNames";

interface MatchRow { id: string; home_id: string; away_id: string; kickoff_utc: string }

export async function syncOddsPapi(env: Env, hoursAhead = 36, maxFixtures = 12): Promise<{ inserted: number; fixtures: number; skipped: string[] }> {
  if (!env.ODDSPAPI_KEY) throw new Error("ODDSPAPI_KEY not set");

  // 只處理近期未開賽、且能對映到 fixture 的場次
  const { results: upcoming } = await env.DB.prepare(
    `SELECT id, home_id, away_id, kickoff_utc FROM matches
     WHERE status != 'FINISHED'
       AND kickoff_utc <= datetime('now', '+' || ?1 || ' hours')
       AND kickoff_utc >= datetime('now', '-2 hours')
     ORDER BY kickoff_utc LIMIT ?2`,
  ).bind(hoursAhead, maxFixtures).all<MatchRow>();

  if (!upcoming?.length) return { inserted: 0, fixtures: 0, skipped: ["no near-term matches"] };

  // 取 World Cup fixtures（1 次呼叫）
  const from = new Date(Date.now() - 2 * 3600_000).toISOString().slice(0, 10);
  const to = new Date(Date.now() + hoursAhead * 3600_000).toISOString().slice(0, 10);
  const fxRes = await fetch(`${BASE}/fixtures?sportId=10&from=${from}&to=${to}&apiKey=${env.ODDSPAPI_KEY}`, {
    signal: AbortSignal.timeout(30_000),
  });
  if (!fxRes.ok) throw new Error(`oddspapi fixtures ${fxRes.status}: ${await fxRes.text()}`);
  const fxData = (await fxRes.json()) as any;
  const fixtures = (fxData.fixtures ?? fxData.data ?? fxData ?? []).filter(
    (f: any) => /world cup/i.test(f.tournamentName ?? f.tournament ?? ""),
  );

  const now = new Date().toISOString();
  const skipped: string[] = [];
  let inserted = 0;
  const touched = new Set<string>();

  for (const m of upcoming) {
    // 配對 fixture：兩隊 TLA 相符 + 開賽時間誤差 < 3h
    const fx = fixtures.find((f: any) => {
      const h = NAME_TO_TLA[f.homeTeam ?? f.home ?? ""];
      const a = NAME_TO_TLA[f.awayTeam ?? f.away ?? ""];
      const t = new Date(f.startTime ?? f.commenceTime ?? f.date ?? 0).getTime();
      return h === m.home_id && a === m.away_id && Math.abs(t - new Date(m.kickoff_utc).getTime()) < 3 * 3600_000;
    });
    if (!fx) { skipped.push(`${m.home_id} vs ${m.away_id}`); continue; }

    const fixtureId = fx.fixtureId ?? fx.id;
    const oddsRes = await fetch(`${BASE}/odds?fixtureId=${fixtureId}&bookmakers=pinnacle,bet365&apiKey=${env.ODDSPAPI_KEY}`, {
      signal: AbortSignal.timeout(30_000),
    });
    if (!oddsRes.ok) { skipped.push(`odds ${fixtureId} ${oddsRes.status}`); continue; }
    const od = (await oddsRes.json()) as any;
    const bookOdds = od.bookmakerOdds ?? od.data?.bookmakerOdds ?? {};

    const stmts: D1PreparedStatement[] = [];
    for (const [slug, book] of Object.entries<any>(bookOdds)) {
      const m101 = book.markets?.["101"];
      if (!m101?.outcomes) continue;
      const price = (oid: string) => m101.outcomes?.[oid]?.players?.["0"]?.price;
      const map: [string, string][] = [["101", "home"], ["102", "draw"], ["103", "away"]];
      for (const [oid, sel] of map) {
        const p = price(oid);
        if (p > 1) stmts.push(insertSnap(env, m.id, slug, "1x2", null, sel, p, now));
      }
    }
    if (stmts.length) {
      await env.DB.batch(stmts);
      inserted += stmts.length;
      touched.add(m.id);
    }
  }

  await env.CACHE.put("odds:lastSync", now);
  for (const source of ["pinnacle", "bet365"]) await detectMovement(env, source, [...touched]);
  return { inserted, fixtures: fixtures.length, skipped };
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
