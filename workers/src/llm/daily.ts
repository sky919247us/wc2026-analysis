/**
 * 每日總覽：AI 生成當日世界盃賽事 + AI 精選 + 價值玩法的白話短文，存 KV。
 */
import type { Env } from "../env";
import { generateWithFallback } from "./provider";
import { buildParlays } from "../models/parlays";

export async function generateDailySummary(env: Env): Promise<{ ok: boolean; date: string }> {
  // 接下來 24 小時內開賽的賽事 + 最新預測
  const today = new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Taipei" });
  const { results: matches } = await env.DB.prepare(
    `SELECT h.name_zh AS home_zh, a.name_zh AS away_zh, m.kickoff_utc,
            p.prob_home, p.prob_draw, p.prob_away, p.confidence
     FROM matches m
     JOIN teams h ON h.id = m.home_id JOIN teams a ON a.id = m.away_id
     LEFT JOIN (SELECT match_id, MAX(created_at) mx FROM predictions GROUP BY match_id) lp ON lp.match_id = m.id
     LEFT JOIN predictions p ON p.match_id = m.id AND p.created_at = lp.mx
     WHERE m.status != 'FINISHED'
       AND m.kickoff_utc >= datetime('now')
       AND m.kickoff_utc <= datetime('now', '+24 hours')
     ORDER BY m.kickoff_utc`,
  ).all<any>();

  if (!matches?.length) {
    await env.CACHE.put("daily:summary", JSON.stringify({ date: today, content: "未來 24 小時內無世界盃賽事。", generatedAt: new Date().toISOString() }));
    return { ok: true, date: today };
  }

  const matchLines = matches.map((m: any) => {
    const t = new Date(m.kickoff_utc).toLocaleString("zh-TW", { timeZone: "Asia/Taipei", month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" });
    let pick = "";
    if (m.prob_home != null) {
      const mx = Math.max(m.prob_home, m.prob_draw, m.prob_away);
      const sel = mx === m.prob_home ? `${m.home_zh}勝` : mx === m.prob_away ? `${m.away_zh}勝` : "和局";
      pick = `AI看好${sel}(${(mx * 100).toFixed(0)}%,信心${m.confidence})`;
    }
    return `${t} ${m.home_zh} vs ${m.away_zh} ${pick}`;
  }).join("\n");

  const { valueLegs } = await buildParlays(env);
  const valueText = valueLegs.slice(0, 4).map((l: any) => `${l.match} ${l.pick}@${l.odds}(EV+${l.ev}%)`).join("；") || "今日無明顯正期望值玩法";

  const r = await generateWithFallback(env, {
    system: "你是台灣的足球分析師，用繁體中文寫『未來24小時世界盃賽事總覽』，輕鬆口語、像跟朋友聊球。涵蓋接下來24小時的焦點戰、AI最看好的2-3場、值得留意的價值玩法。250-400字，分段加emoji小標。不要提到『水錢』『抽水』『水位』等字眼，談價值直接用期望值(EV)說明。結尾附：以上僅供參考，不構成投注建議，未滿18歲不得購買運動彩券，理性投注。",
    prompt: `產生時間：${today} 下午3點（台灣）\n接下來24小時的賽事與AI預測（時間為台灣時間）：\n${matchLines}\n\n價值玩法(EV)：${valueText}\n\n請寫未來24小時賽事總覽。`,
    maxTokens: 1200,
  });

  await env.CACHE.put("daily:summary", JSON.stringify({ date: today, content: r.text, provider: r.provider, generatedAt: new Date().toISOString() }));
  return { ok: true, date: today };
}
