/**
 * REST API（給 Pages 前端讀）
 *   GET /api/health
 *   GET /api/matches?date=YYYY-MM-DD | ?stage=A | ?upcoming=1
 *   GET /api/standings
 *   GET /api/teams
 */
import type { Env } from "../env";

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

  return json({ error: "not found" }, 404);
}
