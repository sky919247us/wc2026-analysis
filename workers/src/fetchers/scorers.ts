/**
 * 進球王同步器
 *  - 2026 當屆：football-data /competitions/WC/scorers（只回傳本屆，隨比賽自動新增）
 *  - 歷史總榜：當屆進球疊加到 wcScorersHistory 種子（截至2022）→ 生涯總進球
 *
 * 兩榜整包存 KV `scorers`，/api/scorers 秒讀。assists 在免費層多為 null，僅取 goals。
 */
import type { Env } from "../env";
import { WC_SCORERS_HISTORY, normName, type HistScorer } from "../data/wcScorersHistory";
import { WC_PLAYER_NAMES_2026 } from "../data/wcPlayerNames2026";

/** 2026 當屆射手中文名（normName → 中文），補種子對不到的現役球員 */
const ZH_2026 = new Map<string, string>(WC_PLAYER_NAMES_2026.map(([en, zh]) => [normName(en), zh]));
const zhOf2026 = (fullName: string): string => ZH_2026.get(normName(fullName)) ?? "";

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
  eliminated?: boolean; // 當屆：球隊已淘汰（球數定格）
  outLabel?: string;    // 當屆：止步輪次，如「16強止步」「小組止步」
}

interface TeamStatus { alive: boolean; label: string }

function stageRank(s: string): number {
  if (s.startsWith("GROUP")) return 0;
  return ({ LAST_32: 1, LAST_16: 2, QUARTER_FINALS: 3, SEMI_FINALS: 4, THIRD_PLACE: 4, FINAL: 5 } as Record<string, number>)[s] ?? 0;
}
const OUT_LABEL: Record<string, string> = {
  GROUP: "小組止步", LAST_32: "32強止步", LAST_16: "16強止步",
  QUARTER_FINALS: "8強止步", SEMI_FINALS: "4強止步",
};

interface MatchRow {
  home_id: string; away_id: string; stage: string; status: string;
  home_score: number | null; away_score: number | null;
}

/**
 * 由 matches 推每隊存活/止步狀態：
 *  有未完賽場次 → 還活著；否則看最深一輪結果。
 *  小組賽止步無法只看比分判定（需晉級資訊）→ 用 standings 的晉級名單 qualSet 區分。
 */
function computeTeamStatus(ms: MatchRow[], qualSet: Set<string>): Map<string, TeamStatus> {
  const perTeam = new Map<string, { hasUnfinished: boolean; deepest?: { rank: number; stage: string; won: boolean } }>();
  const add = (tla: string, stage: string, status: string, won: boolean | null) => {
    if (!tla) return;
    let e = perTeam.get(tla);
    if (!e) { e = { hasUnfinished: false }; perTeam.set(tla, e); }
    if (status !== "FINISHED") { e.hasUnfinished = true; return; }
    const rank = stageRank(stage);
    if (!e.deepest || rank >= e.deepest.rank) e.deepest = { rank, stage, won: won === true };
  };
  for (const m of ms) {
    const finished = m.status === "FINISHED" && m.home_score != null && m.away_score != null;
    const homeWon = finished ? m.home_score! > m.away_score! : null;
    const awayWon = finished ? m.away_score! > m.home_score! : null;
    add(m.home_id, m.stage, m.status, homeWon);
    add(m.away_id, m.stage, m.status, awayWon);
  }
  const out = new Map<string, TeamStatus>();
  for (const [tla, e] of perTeam) {
    if (e.hasUnfinished || !e.deepest) { out.set(tla, { alive: true, label: "" }); continue; }
    const d = e.deepest;
    if (d.stage === "FINAL") { out.set(tla, { alive: false, label: d.won ? "冠軍" : "亞軍" }); continue; }
    if (d.stage === "THIRD_PLACE") { out.set(tla, { alive: false, label: d.won ? "季軍" : "殿軍" }); continue; }
    if (d.stage.startsWith("GROUP")) {
      // 小組賽全部打完：有在晉級名單 = 晉級中（下一輪賽程未建）；否則小組止步
      out.set(tla, qualSet.has(tla) ? { alive: true, label: "" } : { alive: false, label: OUT_LABEL.GROUP });
      continue;
    }
    // 淘汰賽：贏了最深一輪 = 晉級中（下一輪未建）；輸了 = 該輪止步
    out.set(tla, d.won ? { alive: true, label: "" } : { alive: false, label: OUT_LABEL[d.stage] ?? "已淘汰" });
  }
  return out;
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

  // 球隊存活/止步狀態：matches 推算 + standings 晉級名單輔助小組賽判定
  const { results: matchRows } = await env.DB.prepare(
    `SELECT home_id, away_id, stage, status, home_score, away_score FROM matches`,
  ).all<MatchRow>();
  const qualSet = new Set<string>();
  try {
    const stRaw = await env.CACHE.get("standings");
    if (stRaw) for (const r of (JSON.parse(stRaw).ranking ?? []) as { tla: string; status: string }[])
      if (r.status !== "out") qualSet.add(r.tla);
  } catch { /* 無 standings 時小組止步以保守判定 */ }
  const teamStatus = computeTeamStatus(matchRows ?? [], qualSet);

  const idx = buildSeedIndex();

  // 2026 當屆榜（≥1 球，球數降序）
  const current: ScorerRow[] = scorers.map((s) => {
    const seed = matchSeed(idx, s.player?.name ?? "");
    const ts = s.team?.tla ? teamStatus.get(s.team.tla) : undefined;
    return {
      zh: seed?.zh ?? zhOf2026(s.player?.name ?? ""),
      en: seed?.enShort ?? s.player?.name ?? "",
      country: (s.team?.tla && zhByTla[s.team.tla]) || s.team?.name || "",
      goals: s.goals ?? 0,
      matches: s.playedMatches ?? null,
      last: 2026,
      eliminated: ts ? !ts.alive : false,
      outLabel: ts?.label ?? "",
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
      zh: zhOf2026(s.player?.name ?? ""),
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
