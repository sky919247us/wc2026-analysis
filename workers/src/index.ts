/**
 * WC2026 Worker 入口
 * - fetch: REST API
 * - scheduled: 依 cron 字串分派任務（對應 wrangler.toml triggers）
 */
import type { Env } from "./env";
import { handleApi } from "./api/routes";
import { syncMatches, syncStandings } from "./fetchers/footballData";
import { syncIntlOdds } from "./fetchers/oddsApi";
import { syncOddsPapi } from "./fetchers/oddsPapi";
import { runPredictions } from "./models/predict";
import { settleMatches } from "./models/settle";
import { generateReports } from "./llm/generate";

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url);
    if (req.method === "OPTIONS")
      return new Response(null, {
        headers: {
          "access-control-allow-origin": "*",
          "access-control-allow-methods": "GET, OPTIONS",
        },
      });
    if (url.pathname.startsWith("/api/")) return handleApi(req, env);
    return new Response("wc2026-api", { status: 200 });
  },

  /**
   * 單一 cron（每 5 分鐘）內部分派：免費帳號 cron 上限 5 個，全帳號共用，
   * 用分鐘數路由可無限加任務而不佔名額。
   */
  async scheduled(event: ScheduledController, env: Env, ctx: ExecutionContext): Promise<void> {
    const d = new Date(event.scheduledTime);
    const minute = d.getUTCMinutes();
    const hour = d.getUTCHours();

    // 每 5 分鐘：台灣運彩賠率快照 + 異動偵測（Phase 2）

    // The Odds API 自適應抓取（免費 500 點/月）：
    //   比賽日（最近一場開球在 +12h 內、或進行中）→ 每 ~90 分鐘抓一次
    //   無比賽 → 完全不抓，省額度
    // cron 每 5 分鐘觸發，實際是否抓由 maybeSyncOdds 內部判斷。
    if (env.ODDS_API_KEY) ctx.waitUntil(maybeSyncOdds(env));
    // b) OddsPapi：免費僅 250 req/月，故一天只跑 2 次（UTC 02:00 / 14:00）整點
    if (minute === 0 && (hour === 2 || hour === 14) && env.ODDSPAPI_KEY)
      ctx.waitUntil(runOddsPapiSync(env));

    // 每 30 分鐘：新聞 RSS（Phase 2）
    // if (minute % 30 === 0) ...

    // 每小時整點：賽程 + 積分榜同步，接著重算預測
    if (minute === 0) ctx.waitUntil(runFixtureSync(env).then(() => runPredictions(env)).then(() => {}));

    // 每 20 分鐘：重算預測（吸收最新 Pinnacle 市場信號）
    if (minute % 20 === 0 && minute !== 0) ctx.waitUntil(runPredictions(env).then(() => {}));

    // 每小時 10 分：對尚無報告的未開賽比賽生成 AI 白話報告（設了 LLM key 才跑）
    const hasLLM = env.GEMINI_API_KEY || env.OPENAI_API_KEY || env.ANTHROPIC_API_KEY;
    if (minute === 10 && hasLLM) ctx.waitUntil(runReportGen(env));

    // 每小時 30 分：先同步最新比分，再賽後對帳（更新戰績 + 完賽隊 Elo）
    if (minute === 30) ctx.waitUntil(runFixtureSync(env).then(() => settleMatches(env)).then(() => {}));
  },
} satisfies ExportedHandler<Env>;

async function runReportGen(env: Env): Promise<void> {
  try {
    const r = await generateReports(env, { limit: 4 }); // gemini-3.5-flash 免費層 5 RPM → 每次 4 場，cron 每小時補滿
    console.log(`report gen: ${r.generated} generated, ${r.skipped} skipped, errors: ${r.errors.join("; ") || "none"}`);
  } catch (e) {
    console.error("report gen failed", e);
  }
}

async function runOddsPapiSync(env: Env): Promise<void> {
  try {
    const r = await syncOddsPapi(env);
    console.log(`oddspapi sync ok: ${r.inserted} snapshots from ${r.fixtures} fixtures, skipped: ${r.skipped.join("; ") || "none"}`);
  } catch (e) {
    console.error("oddspapi sync failed", e);
  }
}

/**
 * 自適應抓取（5 把 key = 2500 點/月）：分層頻率，貼近原始需求
 *   臨場（開球前 3h 內 或 進行中）→ 每 ~10 分鐘
 *   比賽日其他時段（開球在 +12h 內）→ 每 ~60 分鐘
 *   無比賽                          → 不抓（額度留給臨場高頻）
 * 安全閥：額度由 5 把 key 輪替＋耗盡自動跳下一把，全部用完才停。
 */
async function maybeSyncOdds(env: Env): Promise<void> {
  const hot = await env.DB.prepare(
    `SELECT COUNT(*) AS n FROM matches
     WHERE status != 'FINISHED'
       AND kickoff_utc <= datetime('now', '+3 hours')
       AND kickoff_utc >= datetime('now', '-2.5 hours')`,
  ).first<{ n: number }>();

  let thresholdMin: number;
  if (hot && hot.n > 0) {
    thresholdMin = 9; // 臨場每 ~10 分鐘
  } else {
    const matchDay = await env.DB.prepare(
      `SELECT COUNT(*) AS n FROM matches
       WHERE status != 'FINISHED'
         AND kickoff_utc <= datetime('now', '+12 hours')
         AND kickoff_utc >= datetime('now', '-2.5 hours')`,
    ).first<{ n: number }>();
    if (!matchDay || matchDay.n === 0) return; // 無比賽 → 不抓
    thresholdMin = 58; // 比賽日每 ~60 分鐘
  }

  const last = await env.CACHE.get("odds:lastSync");
  if (last && Date.now() - new Date(last).getTime() < thresholdMin * 60_000) return;

  await runIntlOddsSync(env);
}

async function runIntlOddsSync(env: Env): Promise<void> {
  try {
    const r = await syncIntlOdds(env);
    console.log(`intl odds sync ok: ${r.inserted} snapshots, skipped: ${r.skipped.join("; ") || "none"}`);
  } catch (e) {
    console.error("intl odds sync failed", e);
  }
}

async function runFixtureSync(env: Env): Promise<void> {
  try {
    const r = await syncMatches(env);
    const g = await syncStandings(env);
    console.log(`fixture sync ok: ${r.teams} teams, ${r.matches} matches, ${g} groups`);
  } catch (e) {
    console.error("fixture sync failed", e);
  }
}
