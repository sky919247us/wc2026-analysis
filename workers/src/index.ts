/**
 * WC2026 Worker 入口
 * - fetch: REST API
 * - scheduled: 依 cron 字串分派任務（對應 wrangler.toml triggers）
 */
import type { Env } from "./env";
import { handleApi } from "./api/routes";
import { syncMatches, syncStandings } from "./fetchers/footballData";

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
    const minute = new Date(event.scheduledTime).getUTCMinutes();

    // 每 5 分鐘：台灣運彩賠率快照 + 異動偵測（Phase 2）

    // 每 15 分鐘：國際賠率 The Odds API（Phase 2）
    // if (minute % 15 === 0) ...

    // 每 30 分鐘：新聞 RSS（Phase 2）
    // if (minute % 30 === 0) ...

    // 每小時整點：賽程 + 積分榜同步（Phase 1 主任務）
    if (minute === 0) ctx.waitUntil(runFixtureSync(env));

    // 每小時 30 分：賽後對帳（Phase 5）；先借作第二次賽程同步，比賽日更即時
    if (minute === 30) ctx.waitUntil(runFixtureSync(env));
  },
} satisfies ExportedHandler<Env>;

async function runFixtureSync(env: Env): Promise<void> {
  try {
    const r = await syncMatches(env);
    const g = await syncStandings(env);
    console.log(`fixture sync ok: ${r.teams} teams, ${r.matches} matches, ${g} groups`);
  } catch (e) {
    console.error("fixture sync failed", e);
  }
}
