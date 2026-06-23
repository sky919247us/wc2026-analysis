/**
 * 新聞中心：聚合足球 RSS（不需 key），存 news 表，世界盃相關自動標籤。
 * Workers 無 DOM parser，用正則解析 RSS <item>。
 */
import type { Env } from "../env";
import { generateWithFallback } from "../llm/provider";

interface Feed { source: string; url: string; lang: string }
const FEEDS: Feed[] = [
  { source: "BBC Sport", url: "https://feeds.bbci.co.uk/sport/football/rss.xml", lang: "en" },
  { source: "ESPN FC", url: "https://www.espn.com/espn/rss/soccer/news", lang: "en" },
  { source: "Sky Sports", url: "https://www.skysports.com/rss/12040", lang: "en" },
  { source: "Goal", url: "https://www.goal.com/feeds/news?fmt=rss", lang: "en" },
  { source: "Opta Analyst", url: "https://theanalyst.com/feed", lang: "en" },
];

const WC_RE = /world cup|世界盃|fifa|2026/i;

function tag(text: string): string {
  return WC_RE.test(text) ? "worldcup" : "football";
}

/** 從 RSS XML 抽出 items（容錯：抓 title/link/description/pubDate） */
function parseRss(xml: string): { title: string; link: string; desc: string; pub: string }[] {
  const items: { title: string; link: string; desc: string; pub: string }[] = [];
  const blocks = xml.split(/<item[\s>]/i).slice(1);
  for (const b of blocks) {
    const pick = (tag: string) => {
      const m = b.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, "i"));
      if (!m) return "";
      return m[1].replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1").replace(/<[^>]+>/g, "").trim();
    };
    const title = pick("title");
    const link = (b.match(/<link[^>]*>([\s\S]*?)<\/link>/i)?.[1] ?? "").replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1").trim();
    if (title && link) items.push({ title, link, desc: pick("description").slice(0, 300), pub: pick("pubDate") });
  }
  return items;
}

export async function fetchNews(env: Env): Promise<{ inserted: number; feeds: number }> {
  let inserted = 0, okFeeds = 0;
  for (const f of FEEDS) {
    try {
      const res = await fetch(f.url, {
        headers: { "user-agent": "Mozilla/5.0 WC2026NewsBot", "cache-control": "no-cache" },
        cf: { cacheTtl: 0, cacheEverything: false },
        signal: AbortSignal.timeout(20_000),
      } as RequestInit);
      if (!res.ok) continue;
      const items = parseRss(await res.text());
      if (!items.length) continue;
      okFeeds++;
      const stmts = items.slice(0, 30).map((it) =>
        env.DB.prepare(
          `INSERT INTO news (source, title, url, summary, lang, tags, published_at)
           VALUES (?1,?2,?3,?4,?5,?6,?7)
           ON CONFLICT(url) DO NOTHING`,
        ).bind(f.source, it.title, it.link, it.desc, f.lang, tag(it.title + it.desc), it.pub || null),
      );
      for (let i = 0; i < stmts.length; i += 20) {
        const r = await env.DB.batch(stmts.slice(i, i + 20));
        inserted += r.reduce((a, x) => a + (x.meta?.changes ?? 0), 0);
      }
    } catch { /* 單一來源失敗不影響其他 */ }
  }
  // 清理 14 天前舊聞，控制資料量
  await env.DB.prepare(`DELETE FROM news WHERE fetched_at < datetime('now','-14 days')`).run();
  await env.CACHE.put("news:lastSync", new Date().toISOString());
  return { inserted, feeds: okFeeds };
}

/** 把尚未翻譯的英文標題批次翻成繁中（每批 10 則，省 LLM 呼叫；無 LLM key 則略過） */
export async function translateNews(env: Env, limit = 20): Promise<{ translated: number }> {
  if (!(env.GEMINI_API_KEY || env.OPENAI_API_KEY || env.ANTHROPIC_API_KEY)) return { translated: 0 };
  const { results } = await env.DB.prepare(
    `SELECT id, title FROM news WHERE title_zh IS NULL AND lang = 'en' ORDER BY fetched_at DESC LIMIT ?1`,
  ).bind(limit).all<{ id: number; title: string }>();
  if (!results?.length) return { translated: 0 };

  let translated = 0;
  for (let i = 0; i < results.length; i += 10) {
    const batch = results.slice(i, i + 10);
    const numbered = batch.map((r, j) => `${j + 1}. ${r.title}`).join("\n");
    try {
      const r = await generateWithFallback(env, {
        system: "你是專業體育新聞翻譯。把使用者給的英文足球新聞標題逐行翻成自然、精簡的繁體中文。只輸出譯文，保持相同編號與行數，不要加任何說明。",
        prompt: numbered, maxTokens: 800, temperature: 0.3,
      });
      const lines = r.text.split("\n").map((l) => l.replace(/^\s*\d+[.、)]\s*/, "").trim()).filter(Boolean);
      const stmts = batch.map((row, j) => lines[j]
        ? env.DB.prepare(`UPDATE news SET title_zh = ?1 WHERE id = ?2`).bind(lines[j], row.id) : null
      ).filter(Boolean) as D1PreparedStatement[];
      if (stmts.length) { await env.DB.batch(stmts); translated += stmts.length; }
    } catch (e) { console.warn("translateNews batch failed", e); break; } // 多半是 LLM 限流，下輪再續
  }
  return { translated };
}
