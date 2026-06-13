/**
 * REST API（給 Pages 前端讀）
 *   GET /api/health
 *   GET /api/matches?date=YYYY-MM-DD | ?stage=A | ?upcoming=1
 *   GET /api/standings
 *   GET /api/teams
 */
import type { Env } from "../env";
import { syncMatches, syncStandings } from "../fetchers/footballData";
import { syncIntlOdds } from "../fetchers/oddsApi";
import { handleIngest } from "./ingest";
import { evForMarket } from "../models/ev";

const JSON_HEADERS = {
  "content-type": "application/json; charset=utf-8",
  "access-control-allow-origin": "*", // Pages 與 Worker 不同網域，開 CORS
  "cache-control": "public, max-age=60",
};

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), { status, headers: JSON_HEADERS });
}

export async function handleApi(req: Request, env: Env): Promise<Response> {
  const url = new URL(req.url);
  const path = url.pathname;

  if (path === "/api/health") {
    const lastSync = await env.CACHE.get("matches:lastSync");
    return json({ ok: true, lastSync });
  }

  if (path === "/api/matches") {
    const date = url.searchParams.get("date");
    const stage = url.searchParams.get("stage");
    const upcoming = url.searchParams.get("upcoming");

    let where = "1=1";
    const binds: string[] = [];
    if (date) {
      where += " AND date(m.kickoff_utc) = ?";
      binds.push(date);
    }
    if (stage) {
      where += " AND m.stage = ?";
      binds.push(stage.length === 1 ? `GROUP_${stage}` : stage);
    }
    if (upcoming) where += " AND m.status != 'FINISHED'";

    const { results } = await env.DB.prepare(
      `SELECT m.id, m.stage, m.kickoff_utc, m.status, m.home_score, m.away_score,
              h.id AS home_id, h.name_zh AS home_zh, h.name_en AS home_en,
              a.id AS away_id, a.name_zh AS away_zh, a.name_en AS away_en
       FROM matches m
       JOIN teams h ON h.id = m.home_id
       JOIN teams a ON a.id = m.away_id
       WHERE ${where}
       ORDER BY m.kickoff_utc
       LIMIT 200`,
    ).bind(...binds).all();
    return json({ matches: results });
  }

  if (path === "/api/standings") {
    const cached = await env.CACHE.get("standings");
    return cached
      ? new Response(cached, { headers: JSON_HEADERS })
      : json({ updatedAt: null, groups: [] });
  }

  if (path === "/api/teams") {
    const { results } = await env.DB.prepare(
      `SELECT id, name_zh, name_en, fifa_rank, grp, elo FROM teams ORDER BY grp, id`,
    ).all();
    return json({ teams: results });
  }

  // 賠率：每場每來源每市場的最新快照 + 前次比較 + 台灣運彩 EV
  if (path === "/api/odds") {
    const matchId = url.searchParams.get("match_id");
    if (!matchId) return json({ error: "match_id required" }, 400);
    return json(await buildOddsView(env, matchId));
  }

  // 最近的盤口異動警報
  if (path === "/api/alerts") {
    const { results } = await env.DB.prepare(
      `SELECT a.id, a.match_id, a.rule, a.detail, a.severity, a.created_at,
              h.name_zh AS home_zh, t.name_zh AS away_zh
       FROM odds_alerts a
       JOIN matches m ON m.id = a.match_id
       JOIN teams h ON h.id = m.home_id
       JOIN teams t ON t.id = m.away_id
       ORDER BY a.created_at DESC LIMIT 50`,
    ).all();
    return json({ alerts: results });
  }

  // ---- admin（需 ADMIN_KEY）----
  if (path.startsWith("/api/admin/")) {
    if (!env.ADMIN_KEY || req.headers.get("x-admin-key") !== env.ADMIN_KEY)
      return json({ error: "unauthorized" }, 401);

    if (path === "/api/admin/sync") {
      const r = await syncMatches(env);
      const g = await syncStandings(env);
      return json({ ok: true, ...r, groups: g });
    }
    if (path === "/api/admin/odds-sync") {
      return json(await syncIntlOdds(env));
    }
    if (path === "/api/admin/odds-ingest" && req.method === "POST") {
      return handleIngest(req, env);
    }
  }

  return json({ error: "not found" }, 404);
}

/** 組合一場比賽的賠率視圖：各來源最新 1x2/大小球 + 變動 + 運彩 EV */
async function buildOddsView(env: Env, matchId: string) {
  const { results } = await env.DB.prepare(
    `SELECT source, market, line, selection, odds, captured_at
     FROM odds_snapshots
     WHERE match_id = ?1
     ORDER BY captured_at DESC LIMIT 400`,
  ).bind(matchId).all<{
    source: string; market: string; line: number | null;
    selection: string; odds: number; captured_at: string;
  }>();

  // 每個 (source, market, line, selection) 取最新與前一筆
  const latest = new Map<string, { odds: number; at: string; prev?: number }>();
  for (const r of results ?? []) {
    const key = `${r.source}|${r.market}|${r.line ?? ""}|${r.selection}`;
    const cur = latest.get(key);
    if (!cur) latest.set(key, { odds: r.odds, at: r.captured_at });
    else if (cur.prev === undefined && r.captured_at !== cur.at) cur.prev = r.odds;
  }

  const view: Record<string, any> = {};
  for (const [key, v] of latest) {
    const [source, market, line, selection] = key.split("|");
    view[source] ??= {};
    view[source][market] ??= {};
    const slot = line ? `${selection}@${line}` : selection;
    view[source][market][slot] = {
      odds: v.odds,
      prev: v.prev ?? null,
      change: v.prev ? +(((v.odds - v.prev) / v.prev) * 100).toFixed(1) : null,
      at: v.at,
    };
  }

  // 台灣運彩 EV：以 Pinnacle 去水機率為基準
  let evView = null;
  const pin = view.pinnacle?.["1x2"];
  const tw = view.tw?.["1x2"];
  if (pin?.home && pin?.draw && pin?.away && tw?.home && tw?.draw && tw?.away) {
    evView = evForMarket(
      ["home", "draw", "away"],
      [tw.home.odds, tw.draw.odds, tw.away.odds],
      [pin.home.odds, pin.draw.odds, pin.away.odds],
    );
  }

  return { match_id: matchId, sources: view, tw_ev: evView };
}
