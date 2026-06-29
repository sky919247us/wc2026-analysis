/**
 * football-data.org 同步器（免費層，含 FIFA World Cup，competition code: WC）
 * - syncMatches: 賽程 + 比分 + 球隊 upsert 進 D1
 * - syncStandings: 官方積分榜整包存 KV（讀取快、不用自己算）
 */
import type { Env } from "../env";

const BASE = "https://api.football-data.org/v4";

/** 球隊中文名對照；沒對到的先顯示英文，之後補 */
const ZH_NAMES: Record<string, string> = {
  ARG: "阿根廷", FRA: "法國", ENG: "英格蘭", BEL: "比利時", BRA: "巴西",
  POR: "葡萄牙", NED: "荷蘭", ESP: "西班牙", URU: "烏拉圭", COL: "哥倫比亞",
  GER: "德國", MAR: "摩洛哥", JPN: "日本", CRO: "克羅埃西亞", USA: "美國",
  MEX: "墨西哥", SEN: "塞內加爾", DEN: "丹麥", SUI: "瑞士", AUS: "澳洲",
  IRN: "伊朗", KOR: "南韓", ECU: "厄瓜多", CAN: "加拿大", QAT: "卡達",
  WAL: "威爾斯", NZL: "紐西蘭", CZE: "捷克", RSA: "南非", KSA: "沙烏地阿拉伯",
  TUN: "突尼西亞", NGA: "奈及利亞", CMR: "喀麥隆", GHA: "迦納", EGY: "埃及",
  ALG: "阿爾及利亞", CIV: "象牙海岸", PAN: "巴拿馬", CRC: "哥斯大黎加",
  HON: "宏都拉斯", JAM: "牙買加", PAR: "巴拉圭", PER: "祕魯", CHI: "智利",
  VEN: "委內瑞拉", BOL: "玻利維亞", SCO: "蘇格蘭", IRL: "愛爾蘭", NOR: "挪威",
  SWE: "瑞典", POL: "波蘭", AUT: "奧地利", SRB: "塞爾維亞", TUR: "土耳其",
  UKR: "烏克蘭", HUN: "匈牙利", SVK: "斯洛伐克", SVN: "斯洛維尼亞",
  ROU: "羅馬尼亞", GRE: "希臘", ALB: "阿爾巴尼亞", GEO: "喬治亞",
  UZB: "烏茲別克", JOR: "約旦", IRQ: "伊拉克", UAE: "阿聯", CUW: "古拉索",
  HAI: "海地", CPV: "維德角", BIH: "波士尼亞", ITA: "義大利",
  COD: "剛果民主共和國", CUR: "古拉索", URY: "烏拉圭",
};

async function fdFetch(env: Env, path: string): Promise<any> {
  if (!env.FOOTBALL_DATA_TOKEN) throw new Error("FOOTBALL_DATA_TOKEN not set");
  const res = await fetch(`${BASE}${path}`, {
    headers: { "X-Auth-Token": env.FOOTBALL_DATA_TOKEN },
    signal: AbortSignal.timeout(30_000),
  });
  if (!res.ok) throw new Error(`football-data ${res.status}: ${await res.text()}`);
  return res.json();
}

export async function syncMatches(env: Env): Promise<{ teams: number; matches: number }> {
  const data = await fdFetch(env, "/competitions/WC/matches");
  const teams = new Map<string, { name: string; grp: string | null }>();
  const stmts: D1PreparedStatement[] = [];

  for (const m of data.matches ?? []) {
    // group 格式如 "GROUP_A"；淘汰賽為 null，用 stage（LAST_32/LAST_16/QUARTER_FINALS...）
    const grp = m.group ?? null;
    for (const side of [m.homeTeam, m.awayTeam]) {
      if (side?.tla && !teams.has(side.tla))
        teams.set(side.tla, { name: side.name, grp: grp?.replace("GROUP_", "") ?? null });
    }
    if (!m.homeTeam?.tla || !m.awayTeam?.tla) continue; // 淘汰賽對手未定
    stmts.push(
      env.DB.prepare(
        `INSERT INTO matches (id, stage, kickoff_utc, home_id, away_id, status, home_score, away_score)
         VALUES (?1,?2,?3,?4,?5,?6,?7,?8)
         ON CONFLICT(id) DO UPDATE SET
           stage=?2, kickoff_utc=?3, home_id=?4, away_id=?5, status=?6, home_score=?7, away_score=?8`,
      ).bind(
        String(m.id),
        grp ?? m.stage,
        m.utcDate,
        m.homeTeam.tla,
        m.awayTeam.tla,
        m.status === "FINISHED" ? "FINISHED" : m.status === "IN_PLAY" || m.status === "PAUSED" ? "LIVE" : "SCHEDULED",
        m.score?.fullTime?.home ?? null,
        m.score?.fullTime?.away ?? null,
      ),
    );
  }

  const teamStmts = [...teams.entries()].map(([tla, t]) =>
    env.DB.prepare(
      `INSERT INTO teams (id, name_zh, name_en, grp) VALUES (?1,?2,?3,?4)
       ON CONFLICT(id) DO UPDATE SET name_zh=?2, name_en=?3, grp=COALESCE(?4, grp)`,
    ).bind(tla, ZH_NAMES[tla] ?? t.name, t.name, t.grp),
  );

  // D1 batch 上限內分批執行
  for (const batch of chunk([...teamStmts, ...stmts], 50)) await env.DB.batch(batch);

  // 近期賽程也放 KV 給首頁秒讀
  await env.CACHE.put("matches:lastSync", new Date().toISOString());
  return { teams: teams.size, matches: stmts.length };
}

export async function syncStandings(env: Env): Promise<number> {
  const data = await fdFetch(env, "/competitions/WC/standings");
  const groups = (data.standings ?? [])
    .filter((s: any) => s.type === "TOTAL")
    .map((s: any) => ({
      group: s.group?.replace("GROUP_", "") ?? "",
      table: (s.table ?? []).map((r: any) => ({
        pos: r.position,
        tla: r.team?.tla,
        name_zh: ZH_NAMES[r.team?.tla] ?? r.team?.name,
        played: r.playedGames,
        won: r.won, draw: r.draw, lost: r.lost,
        gf: r.goalsFor, ga: r.goalsAgainst,
        gd: r.goalDifference, points: r.points,
      })),
    }));

  // 晉級判定：各組前 2 直接晉級；12 個第 3 名按「分→淨→進→勝」取前 8
  const direct = new Set<string>();
  const thirds: any[] = [];
  for (const g of groups) {
    for (const r of g.table) {
      if (!r.tla) continue;
      if (r.pos <= 2) direct.add(r.tla);
      else if (r.pos === 3) thirds.push(r);
    }
  }
  thirds.sort((a, b) => b.points - a.points || b.gd - a.gd || (b.gf ?? 0) - (a.gf ?? 0) || b.won - a.won);
  const thirdQ = new Set(thirds.slice(0, 8).map((t) => t.tla));
  const statusOf = (tla: string): "direct" | "third" | "out" =>
    direct.has(tla) ? "direct" : thirdQ.has(tla) ? "third" : "out";

  // 攤平積分排名（分→淨→進），附晉級狀態給前端排行榜上色
  const ranking = groups
    .flatMap((g: any) => g.table.map((r: any) => ({ ...r, group: g.group })))
    .filter((r: any) => r.tla)
    .sort((a: any, b: any) => b.points - a.points || b.gd - a.gd || (b.gf ?? 0) - (a.gf ?? 0))
    .map((r: any) => ({
      tla: r.tla, name_zh: r.name_zh, group: r.group,
      points: r.points, gd: r.gd, status: statusOf(r.tla),
    }));

  await env.CACHE.put("standings", JSON.stringify({ updatedAt: new Date().toISOString(), groups, ranking }));
  return groups.length;
}

function chunk<T>(arr: T[], n: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n));
  return out;
}
