/**
 * 通用賠率寫入口：POST /api/admin/odds-ingest（ADMIN_KEY 驗證）
 * 資料源無關 —— The Odds API、台灣運彩爬蟲、未來任何來源都走這裡。
 *
 * body: {
 *   source: "tw" | "pinnacle" | "bet365" | ...,
 *   snapshots: [{ match_id, market, line?, selection, odds }]
 * }
 */
import type { Env } from "../env";
import { detectMovement } from "../models/movement";

interface IngestSnapshot {
  match_id: string;
  market: string; // 1x2 / handicap / total / correct_score
  line?: number | null;
  selection: string; // home/draw/away/over/under/...
  odds: number;
}

export async function handleIngest(req: Request, env: Env): Promise<Response> {
  const body = (await req.json()) as { source?: string; snapshots?: IngestSnapshot[] };
  if (!body.source || !Array.isArray(body.snapshots) || !body.snapshots.length)
    return Response.json({ error: "source and snapshots required" }, { status: 400 });

  const now = new Date().toISOString();
  const stmts = body.snapshots
    .filter((s) => s.match_id && s.market && s.selection && s.odds > 1)
    .map((s) =>
      env.DB.prepare(
        `INSERT INTO odds_snapshots (match_id, source, market, line, selection, odds, captured_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)`,
      ).bind(s.match_id, body.source, s.market, s.line ?? null, s.selection, s.odds, now),
    );

  for (let i = 0; i < stmts.length; i += 50) await env.DB.batch(stmts.slice(i, i + 50));

  const matchIds = [...new Set(body.snapshots.map((s) => s.match_id))];
  const alerts = await detectMovement(env, body.source, matchIds);

  return Response.json({ ok: true, inserted: stmts.length, matches: matchIds.length, alerts });
}
