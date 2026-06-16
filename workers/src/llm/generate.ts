/**
 * 報告產生器：從 D1 取預測 + 賠率 → 組 MatchAnalysisInput → LLM 生成 → 存 reports 表。
 * 只對「尚無報告」或「強制重生」的未開賽比賽生成，控制成本。
 */
import type { Env } from "../env";
import { generateMatchReport, type MatchAnalysisInput } from "./report";
import { evForMarket } from "../models/ev";

interface PredRow {
  match_id: string; prob_home: number; prob_draw: number; prob_away: number;
  xg_home: number; xg_away: number; confidence: number; upset_index: number;
  home_zh: string; away_zh: string; kickoff_utc: string;
  elo_home: number; elo_away: number;
}

export async function generateReports(env: Env, opts: { matchId?: string; force?: boolean; limit?: number } = {}): Promise<{ generated: number; skipped: number; errors: string[] }> {
  const limit = opts.limit ?? 4; // gemini-3.5-flash 免費層 5 RPM，預設保守批量
  const errors: string[] = [];
  let generated = 0, skipped = 0;

  // 取未開賽、各場最新一筆預測（可指定單場）
  const where = opts.matchId ? "AND p.match_id = ?2" : "";
  const stmt = env.DB.prepare(
    `SELECT p.match_id, p.prob_home, p.prob_draw, p.prob_away, p.xg_home, p.xg_away,
            p.confidence, p.upset_index,
            h.name_zh AS home_zh, a.name_zh AS away_zh, m.kickoff_utc,
            h.elo AS elo_home, a.elo AS elo_away
     FROM predictions p
     JOIN (SELECT match_id, MAX(created_at) AS mx FROM predictions GROUP BY match_id) last
       ON last.match_id = p.match_id AND last.mx = p.created_at
     JOIN matches m ON m.id = p.match_id
     JOIN teams h ON h.id = m.home_id
     JOIN teams a ON a.id = m.away_id
     WHERE m.status != 'FINISHED' ${where}
     ORDER BY m.kickoff_utc LIMIT ?1`,
  );
  const { results } = await (opts.matchId ? stmt.bind(limit, opts.matchId) : stmt.bind(limit)).all<PredRow>();

  for (const p of results ?? []) {
    // 已有報告且非強制 → 跳過（省 API）
    if (!opts.force) {
      const existing = await env.DB.prepare(`SELECT match_id FROM reports WHERE match_id = ?1`).bind(p.match_id).first();
      if (existing) { skipped++; continue; }
    }

    // 台灣運彩 EV（有 tw + pinnacle 1x2 才算）
    const twEv = await buildTwEv(env, p.match_id);

    const input: MatchAnalysisInput = {
      matchId: p.match_id, home: p.home_zh, away: p.away_zh,
      kickoffLocal: new Date(p.kickoff_utc).toLocaleString("zh-TW", { timeZone: "Asia/Taipei", month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" }),
      eloHome: p.elo_home, eloAway: p.elo_away, xgHome: p.xg_home, xgAway: p.xg_away,
      probHome: p.prob_home, probDraw: p.prob_draw, probAway: p.prob_away,
      confidence: p.confidence, upsetIndex: p.upset_index,
      twOdds: twEv,
    };

    try {
      const r = await generateMatchReport(env, input);
      await env.DB.prepare(
        `INSERT INTO reports (match_id, content_md, llm_provider, llm_model, input_tokens, output_tokens, generated_at)
         VALUES (?1,?2,?3,?4,?5,?6,datetime('now'))
         ON CONFLICT(match_id) DO UPDATE SET
           content_md=?2, llm_provider=?3, llm_model=?4, input_tokens=?5, output_tokens=?6, generated_at=datetime('now')`,
      ).bind(p.match_id, r.text, r.provider, r.model, r.inputTokens ?? null, r.outputTokens ?? null).run();
      generated++;
    } catch (e) {
      errors.push(`${p.match_id}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  return { generated, skipped, errors };
}

async function buildTwEv(env: Env, matchId: string): Promise<MatchAnalysisInput["twOdds"]> {
  const { results } = await env.DB.prepare(
    `SELECT source, selection, odds FROM odds_snapshots
     WHERE match_id = ?1 AND market = '1x2' AND source IN ('tw','pinnacle')
     ORDER BY captured_at DESC LIMIT 60`,
  ).bind(matchId).all<{ source: string; selection: string; odds: number }>();

  const latest: Record<string, Record<string, number>> = {};
  for (const r of results ?? []) {
    latest[r.source] ??= {};
    if (latest[r.source][r.selection] === undefined) latest[r.source][r.selection] = r.odds;
  }
  const tw = latest.tw, pin = latest.pinnacle;
  if (!tw?.home || !tw?.draw || !tw?.away || !pin?.home || !pin?.draw || !pin?.away) return [];

  const ev = evForMarket(["home", "draw", "away"], [tw.home, tw.draw, tw.away], [pin.home, pin.draw, pin.away]);
  const zh = { home: "不讓分主勝", draw: "和局", away: "不讓分客勝" } as const;
  return ev.map((e) => ({ market: zh[e.selection as keyof typeof zh], odds: e.twOdds, ev: e.ev }));
}
