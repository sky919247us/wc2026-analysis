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

  async scheduled(event: ScheduledController, env: Env, ctx: ExecutionContext): Promise<void> {
    switch (event.cron) {
      case "*/5 * * * *": // 台灣運彩賠率快照（Phase 2）
        break;
      case "*/15 * * * *": // 國際賠率（Phase 2）
        break;
      case "*/30 * * * *": // 新聞 RSS（Phase 2）
        break;
      case "0 * * * *": // 賽程 + 積分榜同步（Phase 1 主任務）
        ctx.waitUntil(runFixtureSync(env));
        break;
      case "30 * * * *": // 賽後對帳（Phase 5）；先借來做第二次賽程同步，比賽日更即時
        ctx.waitUntil(runFixtureSync(env));
        break;
    }
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
