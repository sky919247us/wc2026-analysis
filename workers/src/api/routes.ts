/**
 * REST API（給 Pages 前端讀）
 *   GET /api/health
 *   GET /api/matches?date=YYYY-MM-DD | ?stage=A | ?upcoming=1
 *   GET /api/standings
 *   GET /api/teams
 */
import type { Env } from "../env";
import { syncMatches, syncStandings } from "../fetchers/footballData";
import { syncScorers } from "../fetchers/scorers";
import { syncIntlOdds } from "../fetchers/oddsApi";
import { syncOddsPapi } from "../fetchers/oddsPapi";
import { handleIngest } from "./ingest";
import { evForMarket } from "../models/ev";
import { handicapProbs } from "../models/poisson";
import { runPredictions } from "../models/predict";
import { settleMatches, entryClosingOdds } from "../models/settle";
import { buildParlays } from "../models/parlays";
import { syncOutright } from "../fetchers/outright";
import { generateReports } from "../llm/generate";
import { fetchNews, translateNews } from "../fetchers/news";
import { generateDailySummary } from "../llm/daily";
import { handleWebhook, broadcast } from "../notify/telegram";

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

  // Telegram webhook（BotFather 設定的 URL）。用 path 內含 secret 驗證來源。
  if (path.startsWith("/api/tg/") && req.method === "POST") {
    if (env.TELEGRAM_WEBHOOK_SECRET && path !== `/api/tg/${env.TELEGRAM_WEBHOOK_SECRET}`)
      return json({ error: "forbidden" }, 403);
    try { await handleWebhook(env, await req.json()); } catch { /* ignore bad update */ }
    return json({ ok: true });
  }

  if (path === "/api/health") {
    const lastSync = await env.CACHE.get("matches:lastSync");
    const oddsSync = await env.CACHE.get("odds:lastSync");
    const oddsRemaining = JSON.parse((await env.CACHE.get("odds:remaining")) ?? "null");
    return json({ ok: true, lastSync, oddsSync, oddsRemaining });
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

  // 淘汰賽對戰表：32強→16強→8強→4強→季軍戰→決賽（隨 syncMatches 自動長出）
  if (path === "/api/bracket") {
    // LEFT JOIN：對手未定的一邊（home_zh/away_zh = null）也要回傳，前端顯示「待定」。
    // 依 id 排序＝對戰籤位順序（football-data 淘汰賽 id 即籤位序）。
    const { results } = await env.DB.prepare(
      `SELECT m.id, m.stage, m.kickoff_utc, m.status, m.home_score, m.away_score,
              h.id AS home_id, h.name_zh AS home_zh, a.id AS away_id, a.name_zh AS away_zh
       FROM matches m
       LEFT JOIN teams h ON h.id = m.home_id
       LEFT JOIN teams a ON a.id = m.away_id
       WHERE m.stage IN ('LAST_32','LAST_16','QUARTER_FINALS','SEMI_FINALS','THIRD_PLACE','FINAL')
       ORDER BY CAST(m.id AS INTEGER)`,
    ).all();
    return json({ matches: results });
  }

  // 進球王：2026 當屆榜 + 歷史生涯總榜（整包 KV）
  if (path === "/api/scorers") {
    const cached = await env.CACHE.get("scorers");
    return cached
      ? new Response(cached, { headers: JSON_HEADERS })
      : json({ updatedAt: null, current2026: [], allTime: [] });
  }

  if (path === "/api/teams") {
    const { results } = await env.DB.prepare(
      `SELECT id, name_zh, name_en, fifa_rank, grp, elo FROM teams ORDER BY grp, id`,
    ).all();
    const form = await teamForm(env);
    return json({ teams: (results ?? []).map((t: any) => ({ ...t, form: form[t.id] ?? "" })) });
  }

  // 賠率走勢：某場 1x2 各來源隨時間的賠率序列（給走勢圖）
  if (path === "/api/odds-history") {
    const matchId = url.searchParams.get("match_id");
    if (!matchId) return json({ error: "match_id required" }, 400);
    const { results } = await env.DB.prepare(
      `SELECT source, selection, odds, captured_at FROM odds_snapshots
       WHERE match_id = ?1 AND market = '1x2'
       ORDER BY captured_at ASC LIMIT 1000`,
    ).bind(matchId).all<{ source: string; selection: string; odds: number; captured_at: string }>();
    // 整理成 { source: { selection: [{t,odds}] } }
    const series: Record<string, Record<string, { t: string; odds: number }[]>> = {};
    for (const r of results ?? []) {
      ((series[r.source] ??= {})[r.selection] ??= []).push({ t: r.captured_at, odds: r.odds });
    }
    return json({ match_id: matchId, series });
  }

  // 賠率：每場每來源每市場的最新快照 + 前次比較 + 台灣運彩 EV
  if (path === "/api/odds") {
    const matchId = url.searchParams.get("match_id");
    if (!matchId) return json({ error: "match_id required" }, 400);
    return json(await buildOddsView(env, matchId));
  }

  // 最新 AI 推薦：信心最高的未開賽比賽（首頁精選）
  if (path === "/api/top-picks") {
    const limit = Math.min(Number(url.searchParams.get("limit")) || 6, 20);
    const { results } = await env.DB.prepare(
      `SELECT p.match_id, p.prob_home, p.prob_draw, p.prob_away, p.confidence, p.upset_index, p.risk_grade,
              p.xg_home, p.xg_away,
              h.id AS home_id, a.id AS away_id, h.name_zh AS home_zh, a.name_zh AS away_zh,
              m.kickoff_utc, m.stage,
              CASE WHEN r.match_id IS NULL THEN 0 ELSE 1 END AS has_report
       FROM predictions p
       JOIN (SELECT match_id, MAX(created_at) AS mx FROM predictions GROUP BY match_id) last
         ON last.match_id = p.match_id AND last.mx = p.created_at
       JOIN matches m ON m.id = p.match_id
       JOIN teams h ON h.id = m.home_id
       JOIN teams a ON a.id = m.away_id
       LEFT JOIN reports r ON r.match_id = p.match_id
       WHERE m.status = 'SCHEDULED'
         AND m.kickoff_utc >= datetime('now', '-2 hours')
       ORDER BY p.confidence DESC, m.kickoff_utc
       LIMIT ?1`,
    ).bind(limit).all();
    return json({ picks: results });
  }

  // 每日總覽
  if (path === "/api/daily-summary") {
    const raw = await env.CACHE.get("daily:summary");
    return json({ summary: raw ? JSON.parse(raw) : null });
  }

  // AI 白話報告（單場）
  if (path === "/api/report") {
    const matchId = url.searchParams.get("match_id");
    if (!matchId) return json({ error: "match_id required" }, 400);
    const row = await env.DB.prepare(
      `SELECT content_md, llm_provider, llm_model, generated_at FROM reports WHERE match_id = ?1`,
    ).bind(matchId).first();
    return json({ report: row });
  }

  // 最新預測（單場用 match_id，或回傳全部最新一筆）
  if (path === "/api/predict") {
    const matchId = url.searchParams.get("match_id");
    if (matchId) {
      const row = await env.DB.prepare(
        `SELECT p.*, h.name_zh AS home_zh, a.name_zh AS away_zh, m.kickoff_utc, m.stage
         FROM predictions p
         JOIN matches m ON m.id = p.match_id
         JOIN teams h ON h.id = m.home_id
         JOIN teams a ON a.id = m.away_id
         WHERE p.match_id = ?1 ORDER BY p.created_at DESC LIMIT 1`,
      ).bind(matchId).first();
      return json({ prediction: row });
    }
    // 各場最新一筆，附隊名
    const { results } = await env.DB.prepare(
      `SELECT p.*, h.name_zh AS home_zh, a.name_zh AS away_zh, m.kickoff_utc, m.stage
       FROM predictions p
       JOIN (SELECT match_id, MAX(created_at) AS mx FROM predictions GROUP BY match_id) last
         ON last.match_id = p.match_id AND last.mx = p.created_at
       JOIN matches m ON m.id = p.match_id
       JOIN teams h ON h.id = m.home_id
       JOIN teams a ON a.id = m.away_id
       WHERE m.status != 'FINISHED'
       ORDER BY m.kickoff_utc LIMIT 200`,
    ).all();
    return json({ predictions: results });
  }

  // 公開戰績：總命中率、ROI、分風險評級統計、近期逐場明細
  if (path === "/api/track") {
    const summary = await env.DB.prepare(
      `SELECT COUNT(*) AS total, SUM(hit) AS hits, ROUND(SUM(profit_units), 2) AS profit,
              ROUND(AVG(clv), 2) AS avg_clv,
              SUM(CASE WHEN clv > 0 THEN 1 ELSE 0 END) AS clv_pos,
              SUM(CASE WHEN clv IS NOT NULL THEN 1 ELSE 0 END) AS clv_n
       FROM track_record`,
    ).first<{ total: number; hits: number; profit: number; avg_clv: number; clv_pos: number; clv_n: number }>();

    const byGrade = await env.DB.prepare(
      `SELECT p.risk_grade AS grade, COUNT(*) AS total, SUM(tr.hit) AS hits
       FROM track_record tr
       JOIN (SELECT match_id, risk_grade, MAX(created_at) FROM predictions GROUP BY match_id) p
         ON p.match_id = tr.match_id
       GROUP BY p.risk_grade ORDER BY p.risk_grade`,
    ).all();

    const recent = await env.DB.prepare(
      `SELECT tr.match_id, tr.recommended_market, tr.recommended_odds, tr.hit, tr.profit_units, tr.settled_at,
              h.name_zh AS home_zh, a.name_zh AS away_zh, m.home_score, m.away_score
       FROM track_record tr
       JOIN matches m ON m.id = tr.match_id
       JOIN teams h ON h.id = m.home_id
       JOIN teams a ON a.id = m.away_id
       ORDER BY tr.settled_at DESC LIMIT 50`,
    ).all();

    // 已預測、尚未開賽的場次（顯示 AI 推薦方向，打完後自動進上方戰績）
    const pending = await env.DB.prepare(
      `SELECT p.match_id, p.prob_home, p.prob_draw, p.prob_away, p.confidence,
              h.name_zh AS home_zh, a.name_zh AS away_zh, m.kickoff_utc,
              (SELECT odds FROM odds_snapshots s WHERE s.match_id = p.match_id AND s.market='1x2'
                 AND s.selection = CASE WHEN p.prob_home>=p.prob_draw AND p.prob_home>=p.prob_away THEN 'home'
                                        WHEN p.prob_away>=p.prob_draw AND p.prob_away>=p.prob_home THEN 'away' ELSE 'draw' END
                 AND s.source IN ('tw','pinnacle') ORDER BY s.captured_at DESC LIMIT 1) AS pick_odds
       FROM predictions p
       JOIN (SELECT match_id, MAX(created_at) mx FROM predictions GROUP BY match_id) lp ON lp.match_id=p.match_id AND lp.mx=p.created_at
       JOIN matches m ON m.id = p.match_id
       JOIN teams h ON h.id = m.home_id JOIN teams a ON a.id = m.away_id
       WHERE m.status = 'SCHEDULED'
       ORDER BY m.kickoff_utc LIMIT 60`,
    ).all();

    // 正確比數預測（獨立統計）：Poisson 前 4 比分任一命中
    const scoreSum = await env.DB.prepare(
      `SELECT COUNT(*) AS total, SUM(hit) AS hits FROM score_record`,
    ).first<{ total: number; hits: number }>();
    const scoreRecent = await env.DB.prepare(
      `SELECT sr.predicted, sr.actual, sr.hit, h.name_zh AS home_zh, a.name_zh AS away_zh
       FROM score_record sr
       JOIN matches m ON m.id = sr.match_id
       JOIN teams h ON h.id = m.home_id JOIN teams a ON a.id = m.away_id
       ORDER BY sr.settled_at DESC LIMIT 40`,
    ).all();
    const sTotal = scoreSum?.total ?? 0, sHits = scoreSum?.hits ?? 0;

    const total = summary?.total ?? 0;
    const hits = summary?.hits ?? 0;
    const profit = summary?.profit ?? 0;
    return json({
      pending: pending.results,
      score: { total: sTotal, hits: sHits, hitRate: sTotal ? +((sHits / sTotal) * 100).toFixed(1) : 0, recent: scoreRecent.results },
      total, hits,
      hitRate: total ? +((hits / total) * 100).toFixed(1) : 0,
      profitUnits: profit,
      roi: total ? +((profit / total) * 100).toFixed(1) : 0, // 每注平均報酬率%
      avgClv: summary?.avg_clv ?? null,
      clvPositiveRate: summary?.clv_n ? +(((summary.clv_pos ?? 0) / summary.clv_n) * 100).toFixed(0) : null,
      byGrade: byGrade.results,
      recent: recent.results,
    });
  }

  // 新聞中心（?tag=worldcup 只看世界盃相關）
  if (path === "/api/news") {
    const tag = url.searchParams.get("tag");
    const where = tag ? "WHERE tags = ?1" : "";
    const stmt = env.DB.prepare(
      `SELECT source, title, title_zh, url, summary, lang, tags, published_at, fetched_at
       FROM news ${where} ORDER BY COALESCE(published_at, fetched_at) DESC LIMIT 60`,
    );
    const { results } = await (tag ? stmt.bind(tag) : stmt).all();
    return json({ news: results });
  }

  // 冠軍盤：奪冠機率榜（參考盤去水）+ 台灣運彩冠軍賠率 + EV + 名次異動
  if (path === "/api/outright") {
    // 參考盤最近兩個快照時間（算名次變化）
    const times = await env.DB.prepare(
      `SELECT DISTINCT captured_at FROM outright_odds WHERE source='market' ORDER BY captured_at DESC LIMIT 2`,
    ).all<{ captured_at: string }>();
    const tCurr = times.results?.[0]?.captured_at, tPrev = times.results?.[1]?.captured_at;

    // 依某時刻的參考盤賠率 → 去水機率 → 名次（team_id → rank, 1 起）
    const ranksAt = async (t?: string): Promise<Record<string, number>> => {
      if (!t) return {};
      const { results } = await env.DB.prepare(
        `SELECT team_id, odds FROM outright_odds WHERE source='market' AND captured_at = ?1`,
      ).bind(t).all<{ team_id: string; odds: number }>();
      const sorted = (results ?? []).filter((r) => r.odds > 1).sort((a, b) => a.odds - b.odds);
      const m: Record<string, number> = {};
      sorted.forEach((r, i) => (m[r.team_id] = i + 1));
      return m;
    };
    const currRanks = await ranksAt(tCurr), prevRanks = await ranksAt(tPrev);

    // 當前參考盤 + 台灣運彩冠軍賠率
    const { results } = await env.DB.prepare(
      `SELECT o.source, o.team_id, o.odds, t.name_zh
       FROM outright_odds o JOIN teams t ON t.id = o.team_id
       WHERE o.captured_at = (SELECT MAX(captured_at) FROM outright_odds o3 WHERE o3.team_id=o.team_id AND o3.source=o.source)`,
    ).all<{ source: string; team_id: string; odds: number; name_zh: string }>();

    const byTeam: Record<string, { name: string; market?: number; tw?: number }> = {};
    for (const r of results ?? []) {
      const e = (byTeam[r.team_id] ??= { name: r.name_zh });
      if (r.source === "market") e.market = r.odds;
      else if (r.source === "tw") e.tw = r.odds;
    }
    const rawSum = Object.values(byTeam).reduce((a, e) => a + (e.market ? 1 / e.market : 0), 0) || 1;
    const board = Object.entries(byTeam).map(([id, e]) => {
      const trueProb = e.market ? (1 / e.market) / rawSum : null;
      const ev = e.tw && trueProb ? trueProb * e.tw - 1 : null;
      // 名次變化：prevRank - currRank（>0 上升、<0 下降、0/無 持平）
      const cr = currRanks[id], pr = prevRanks[id];
      const rankChange = cr != null && pr != null ? pr - cr : 0;
      return { team_id: id, name: e.name, marketOdds: e.market ?? null, twOdds: e.tw ?? null, trueProb, ev, rankChange };
    }).filter((x) => x.trueProb != null)
      .sort((a, b) => (b.trueProb ?? 0) - (a.trueProb ?? 0));
    const updatedAt = await env.CACHE.get("outright:lastSync");
    return json({ updatedAt, board });
  }

  // 串關建議（+EV 單注組合）
  if (path === "/api/parlays") {
    return json(await buildParlays(env));
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
    if (path === "/api/admin/scorers-sync") {
      return json({ ok: true, ...(await syncScorers(env)) });
    }
    if (path === "/api/admin/odds-sync") {
      return json(await syncIntlOdds(env));
    }
    if (path === "/api/admin/oddspapi-sync") {
      return json(await syncOddsPapi(env));
    }
    if (path === "/api/admin/odds-ingest" && req.method === "POST") {
      return handleIngest(req, env);
    }
    if (path === "/api/admin/predict") {
      return json({ ok: true, predictions: await runPredictions(env) });
    }
    if (path === "/api/admin/news") {
      const f = await fetchNews(env);
      const t = await translateNews(env, 40);
      return json({ ok: true, ...f, ...t });
    }
    if (path === "/api/admin/outright") {
      return json({ ok: true, ...(await syncOutright(env)) });
    }
    if (path === "/api/admin/daily-summary") {
      return json(await generateDailySummary(env));
    }
    if (path === "/api/admin/daily-push") {
      const { valueLegs, parlays } = await buildParlays(env);
      if (!valueLegs.length) return json({ ok: true, sent: 0, note: "no +EV legs" });
      const date = new Date().toLocaleDateString("zh-TW", { timeZone: "Asia/Taipei", month: "numeric", day: "numeric" });
      const legLines = valueLegs.slice(0, 5).map((l: any) => `• ${l.match}・${l.pick} @${l.odds}（EV +${l.ev}%）`).join("\n");
      const best = parlays[0];
      const pb = best ? `\n\n🎯 <b>推薦串關（${best.type}）</b>\n合併賠率 ${best.combinedOdds}・命中 ${best.hitProb}%・EV +${best.combinedEv}%\n` + best.legs.map((l: any) => `  └ ${l.match}・${l.pick} @${l.odds}`).join("\n") : "";
      const sent = await broadcast(env, `💎 <b>今日 +EV 精選（${date}）</b>\n\n${legLines}${pb}\n\n<i>以 Pinnacle 去水機率衡量。僅供參考，未滿18歲不得購買運動彩券，理性投注。</i>`);
      return json({ ok: true, sent });
    }
    if (path === "/api/admin/outright-ingest" && req.method === "POST") {
      const body = (await req.json()) as { source?: string; items?: { team_id: string; odds: number }[] };
      if (!body.source || !Array.isArray(body.items)) return json({ error: "bad body" }, 400);
      const now = new Date().toISOString();
      const stmts = body.items.filter((x) => x.team_id && x.odds > 1).map((x) =>
        env.DB.prepare(`INSERT INTO outright_odds (source, team_id, odds, captured_at) VALUES (?1,?2,?3,?4)`)
          .bind(body.source, x.team_id, x.odds, now));
      for (let i = 0; i < stmts.length; i += 30) await env.DB.batch(stmts.slice(i, i + 30));
      return json({ ok: true, inserted: stmts.length });
    }
    if (path === "/api/admin/settle") {
      return json({ ok: true, ...(await settleMatches(env)) });
    }
    if (path === "/api/admin/rebuild-track") {
      // 用收盤賠率（優先 TW）重算整個投注戰績，不動 Elo/score
      await env.DB.prepare(`DELETE FROM track_record`).run();
      const { results: fin } = await env.DB.prepare(
        `SELECT id, home_score, away_score, kickoff_utc FROM matches
         WHERE status='FINISHED' AND home_score IS NOT NULL`,
      ).all<{ id: string; home_score: number; away_score: number; kickoff_utc: string }>();
      let n = 0;
      for (const m of fin ?? []) {
        const actual = m.home_score > m.away_score ? "home" : m.home_score < m.away_score ? "away" : "draw";
        const pred = await env.DB.prepare(
          `SELECT prob_home, prob_draw, prob_away FROM predictions WHERE match_id=?1 AND created_at<=?2 ORDER BY created_at DESC LIMIT 1`,
        ).bind(m.id, m.kickoff_utc).first<{ prob_home: number; prob_draw: number; prob_away: number }>();
        if (!pred) continue;
        const probs = { home: pred.prob_home, draw: pred.prob_draw, away: pred.prob_away };
        const rec = (Object.keys(probs) as (keyof typeof probs)[]).reduce((a, b) => (probs[b] > probs[a] ? b : a));
        const { entry, closing } = await entryClosingOdds(env, m.id, rec, m.kickoff_utc);
        if (!closing) continue;
        const hit = rec === actual ? 1 : 0;
        const profit = hit ? +(closing - 1).toFixed(2) : -1;
        const clv = entry ? +((entry / closing - 1) * 100).toFixed(2) : null;
        await env.DB.prepare(
          `INSERT INTO track_record (match_id, recommended_market, recommended_odds, ev_at_recommend, hit, profit_units, closing_odds, clv, settled_at)
           VALUES (?1,?2,?3,?4,?5,?6,?7,?8,datetime('now'))`,
        ).bind(m.id, rec, closing, null, hit, profit, closing, clv).run();
        n++;
      }
      return json({ ok: true, rebuilt: n });
    }
    if (path === "/api/admin/backfill-scores") {
      // 一次性：為既有完賽且有預測的場次補正確比數對帳（不動 Elo/track）
      const { results: fin } = await env.DB.prepare(
        `SELECT id, home_score, away_score, kickoff_utc FROM matches
         WHERE status='FINISHED' AND home_score IS NOT NULL
           AND id NOT IN (SELECT match_id FROM score_record)`,
      ).all<{ id: string; home_score: number; away_score: number; kickoff_utc: string }>();
      let n = 0;
      for (const m of fin ?? []) {
        const pred = await env.DB.prepare(
          `SELECT detail_json FROM predictions WHERE match_id=?1 AND created_at<=?2 ORDER BY created_at DESC LIMIT 1`,
        ).bind(m.id, m.kickoff_utc).first<{ detail_json: string }>();
        if (!pred) continue;
        try {
          const top = (JSON.parse(pred.detail_json ?? "{}").poissonDetail?.topScores ?? []).map((s: any) => s.score).slice(0, 4);
          if (!top.length) continue;
          const actual = `${m.home_score}-${m.away_score}`;
          await env.DB.prepare(
            `INSERT INTO score_record (match_id, predicted, actual, hit, settled_at) VALUES (?1,?2,?3,?4,datetime('now')) ON CONFLICT(match_id) DO NOTHING`,
          ).bind(m.id, top.join(","), actual, top.includes(actual) ? 1 : 0).run();
          n++;
        } catch { /* skip */ }
      }
      return json({ ok: true, backfilled: n });
    }
    if (path === "/api/admin/report") {
      const matchId = url.searchParams.get("match_id") ?? undefined;
      const force = url.searchParams.get("force") === "1";
      const limit = Number(url.searchParams.get("limit")) || undefined;
      return json({ ok: true, ...(await generateReports(env, { matchId, force, limit })) });
    }
  }

  return json({ error: "not found" }, 404);
}

/** 各隊近 5 場 W/D/L（由完賽比賽計算，最新在左） */
async function teamForm(env: Env): Promise<Record<string, string>> {
  const { results } = await env.DB.prepare(
    `SELECT home_id, away_id, home_score, away_score, kickoff_utc
     FROM matches WHERE status = 'FINISHED' AND home_score IS NOT NULL
     ORDER BY kickoff_utc ASC`,
  ).all<{ home_id: string; away_id: string; home_score: number; away_score: number }>();
  const form: Record<string, string[]> = {};
  for (const m of results ?? []) {
    const hr = m.home_score > m.away_score ? "W" : m.home_score < m.away_score ? "L" : "D";
    const ar = hr === "W" ? "L" : hr === "L" ? "W" : "D";
    (form[m.home_id] ??= []).push(hr);
    (form[m.away_id] ??= []).push(ar);
  }
  const out: Record<string, string> = {};
  for (const [id, arr] of Object.entries(form)) out[id] = arr.slice(-5).reverse().join("");
  return out;
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

  // 台灣運彩 EV（1x2 + 大小球），以 Pinnacle 去水機率為基準
  const evView: any[] = [];
  const SEL_ZH: Record<string, string> = { home: "主勝", draw: "和局", away: "客勝", over: "大 2.5", under: "小 2.5" };
  const pin = view.pinnacle?.["1x2"], tw = view.tw?.["1x2"];
  if (pin?.home && pin?.draw && pin?.away && tw?.home && tw?.draw && tw?.away) {
    for (const e of evForMarket(["home", "draw", "away"], [tw.home.odds, tw.draw.odds, tw.away.odds], [pin.home.odds, pin.draw.odds, pin.away.odds]))
      evView.push({ market: "1x2", label: SEL_ZH[e.selection], ...e });
  }
  const pinT = view.pinnacle?.total, twT = view.tw?.total;
  const pinO = pinT?.["over@2.5"], pinU = pinT?.["under@2.5"], twO = twT?.["over@2.5"], twU = twT?.["under@2.5"];
  if (pinO && pinU && twO && twU) {
    for (const e of evForMarket(["over", "under"], [twO.odds, twU.odds], [pinO.odds, pinU.odds]))
      evView.push({ market: "total", label: SEL_ZH[e.selection], ...e });
  }

  // 讓分盤（歐洲讓分）模型 EV：用 Poisson margin 機率 × 運彩讓分賠率
  let twHandicap = null;
  const twH = view.tw?.handicap;
  if (twH) {
    const pred = await env.DB.prepare(
      `SELECT xg_home, xg_away FROM predictions WHERE match_id = ?1 ORDER BY created_at DESC LIMIT 1`,
    ).bind(matchId).first<{ xg_home: number; xg_away: number }>();
    // 取讓分線（slot 形如 home@3 / draw@3 / away@3）
    const lineMatch = Object.keys(twH)[0]?.match(/@(\d+)/);
    const line = lineMatch ? Number(lineMatch[1]) : null;
    if (pred && line) {
      const hp = handicapProbs(pred.xg_home, pred.xg_away, line);
      const map: [string, string, number][] = [
        [`home@${line}`, `主隊讓分`, hp.homeCover],
        [`draw@${line}`, `讓分和局`, hp.push],
        [`away@${line}`, `客隊讓分`, hp.awayCover],
      ];
      const rows = map.filter(([slot]) => twH[slot]).map(([slot, label, prob]) => ({
        label: `${label}(讓${line}球)`, twOdds: twH[slot].odds, trueProb: prob, ev: prob * twH[slot].odds - 1,
      }));
      if (rows.length) twHandicap = rows;
    }
  }

  return { match_id: matchId, sources: view, tw_ev: evView.length ? evView : null, tw_handicap: twHandicap };
}
