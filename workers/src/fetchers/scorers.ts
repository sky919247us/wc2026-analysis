/**
 * 進球王同步器
 *  - 2026 當屆：football-data /competitions/WC/scorers（只回傳本屆，隨比賽自動新增）
 *  - 歷史總榜：當屆進球疊加到 wcScorersHistory 種子（截至2022）→ 生涯總進球
 *
 * 兩榜整包存 KV `scorers`，/api/scorers 秒讀。assists 在免費層多為 null，僅取 goals。
 */
import type { Env } from "../env";
import { WC_SCORERS_HISTORY, normName, type HistScorer } from "../data/wcScorersHistory";

const BASE = "https://api.football-data.org/v4";

interface FdScorer {
  player?: { name?: string };
  team?: { tla?: string; name?: string };
  goals?: number | null;
  playedMatches?: number | null;
}

export interface ScorerRow {
  zh: string;        // 中文名（對不到種子的新球員為空字串）
  en: string;        // 顯示用英文（姓氏優先）
  country: string;   // 國別（中文）
  goals: number;
  matches?: number | null;
  last: number;      // 最後參賽年份
}

/** 種子英文全名 → 種子，含姓氏備援鍵 */
function buildSeedIndex(): Map<string, HistScorer> {
  const idx = new Map<string, HistScorer>();
  for (const s of WC_SCORERS_HISTORY) {
    idx.set(normName(s.en), s);
    const parts = normName(s.en).split(" ");
    const surname = parts[parts.length - 1];
    if (surname && !idx.has(surname)) idx.set(surname, s); // 姓氏備援（不覆蓋全名鍵）
  }
  return idx;
}

function matchSeed(idx: Map<string, HistScorer>, fullName: string): HistScorer | undefined {
  const n = normName(fullName);
  const hit = idx.get(n);
  if (hit) return hit;
  const parts = n.split(" ");
  return idx.get(parts[parts.length - 1]); // 退而比對姓氏
}

export async function syncScorers(env: Env): Promise<{ current: number; allTime: number }> {
  if (!env.FOOTBALL_DATA_TOKEN) throw new Error("FOOTBALL_DATA_TOKEN not set");
  const res = await fetch(`${BASE}/competitions/WC/scorers?limit=100`, {
    headers: { "X-Auth-Token": env.FOOTBALL_DATA_TOKEN },
    signal: AbortSignal.timeout(30_000),
  });
  if (!res.ok) throw new Error(`football-data scorers ${res.status}: ${await res.text()}`);
  const data = (await res.json()) as { scorers?: FdScorer[] };
  const scorers = (data.scorers ?? []).filter((s) => (s.goals ?? 0) > 0);

  // 國別中文：用 D1 teams（id=tla → name_zh）
  const { results: teamRows } = await env.DB.prepare(
    `SELECT id, name_zh FROM teams`,
  ).all<{ id: string; name_zh: string }>();
  const zhByTla: Record<string, string> = {};
  for (const t of teamRows ?? []) zhByTla[t.id] = t.name_zh;

  const idx = buildSeedIndex();

  // 2026 當屆榜（≥1 球，球數降序）
  const current: ScorerRow[] = scorers.map((s) => {
    const seed = matchSeed(idx, s.player?.name ?? "");
    return {
      zh: seed?.zh ?? "",
      en: seed?.enShort ?? s.player?.name ?? "",
      country: (s.team?.tla && zhByTla[s.team.tla]) || s.team?.name || "",
      goals: s.goals ?? 0,
      matches: s.playedMatches ?? null,
      last: 2026,
    };
  }).sort((a, b) => b.goals - a.goals);

  // 歷史總榜：種子生涯 + 2026 疊加
  const goals2026 = new Map<string, FdScorer>();
  for (const s of scorers) {
    const seed = matchSeed(idx, s.player?.name ?? "");
    if (seed) goals2026.set(seed.en, s);
  }

  const allTime: ScorerRow[] = WC_SCORERS_HISTORY.map((s) => {
    const add = goals2026.get(s.en);
    const g26 = add?.goals ?? 0;
    return {
      zh: s.zh,
      en: s.enShort,
      country: s.country,
      goals: s.g2022 + g26,
      last: g26 > 0 ? 2026 : s.last,
    };
  });

  // 2026 才首度進球、不在種子者 → 以 0 起算新增
  const seedEnSet = new Set(WC_SCORERS_HISTORY.map((s) => s.en));
  for (const s of scorers) {
    const seed = matchSeed(idx, s.player?.name ?? "");
    if (seed && seedEnSet.has(seed.en)) continue; // 已疊加
    if (seed) continue;
    allTime.push({
      zh: "",
      en: s.player?.name ?? "",
      country: (s.team?.tla && zhByTla[s.team.tla]) || s.team?.name || "",
      goals: s.goals ?? 0,
      last: 2026,
    });
  }

  // 歷史總榜只顯示 >5（≥6），球數降序、同分按最後年份新者在前
  const allTimeFiltered = allTime
    .filter((r) => r.goals > 5)
    .sort((a, b) => b.goals - a.goals || b.last - a.last);

  await env.CACHE.put(
    "scorers",
    JSON.stringify({ updatedAt: new Date().toISOString(), current2026: current, allTime: allTimeFiltered }),
  );
  return { current: current.length, allTime: allTimeFiltered.length };
}
