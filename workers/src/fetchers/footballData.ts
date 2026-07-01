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
    const homeTla = m.homeTeam?.tla ?? null;
    const awayTla = m.awayTeam?.tla ?? null;
    // 小組賽缺隊才跳過（理論上不會）；淘汰賽只要有一隊確定就存（保留對戰籤位，
    // 未定的一邊存 null，待 football-data 補齊後由 ON CONFLICT 更新）→ 樹狀圖才看得到已晉級隊
    if (grp ? (!homeTla || !awayTla) : (!homeTla && !awayTla)) continue;
    const { hs, as, hp, ap, winner } = parseScore(m.score);
    stmts.push(
      env.DB.prepare(
        `INSERT INTO matches (id, stage, kickoff_utc, home_id, away_id, status, home_score, away_score, home_pens, away_pens, winner)
         VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11)
         ON CONFLICT(id) DO UPDATE SET
           stage=?2, kickoff_utc=?3, home_id=?4, away_id=?5, status=?6, home_score=?7, away_score=?8, home_pens=?9, away_pens=?10, winner=?11`,
      ).bind(
        String(m.id),
        grp ?? m.stage,
        m.utcDate,
        homeTla,
        awayTla,
        m.status === "FINISHED" ? "FINISHED" : m.status === "IN_PLAY" || m.status === "PAUSED" ? "LIVE" : "SCHEDULED",
        hs, as, hp, ap, winner,
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

/**
 * 解析 football-data score：
 *   home_score/away_score = 正賽+延長賽比分（如 1:1）；
 *   PK 大戰時另存 home_pens/away_pens（取 penalties 或 fullTime 中「有勝負」的來源，
 *   因模擬資料的 penalties 欄偶為平手壞值）。
 */
function parseScore(sc: any): { hs: number | null; as: number | null; hp: number | null; ap: number | null; winner: string | null } {
  if (!sc) return { hs: null, as: null, hp: null, ap: null, winner: null };
  const winner = sc.winner === "HOME_TEAM" ? "HOME" : sc.winner === "AWAY_TEAM" ? "AWAY" : sc.winner === "DRAW" ? "DRAW" : null;
  if (sc.duration === "PENALTY_SHOOTOUT") {
    const rt = sc.regularTime ?? sc.fullTime ?? {};
    const et = sc.extraTime ?? {};
    const hs = rt.home != null ? rt.home + (et.home ?? 0) : null;
    const as = rt.away != null ? rt.away + (et.away ?? 0) : null;
    // PK 真實比分＝penalties 欄（fullTime 是「正賽+PK」加總，非 PK 比分）
    const pen = sc.penalties ?? {};
    return { hs, as, hp: pen.home ?? null, ap: pen.away ?? null, winner };
  }
  // REGULAR / EXTRA_TIME：fullTime 已含延長賽
  return { hs: sc.fullTime?.home ?? null, as: sc.fullTime?.away ?? null, hp: null, ap: null, winner };
}

/** 球員名單：一次呼叫 /competitions/WC/teams 拿 48 隊 squad（免費層即有） */
export async function syncSquads(env: Env): Promise<{ teams: number; players: number }> {
  const data = await fdFetch(env, "/competitions/WC/teams");
  const stmts: D1PreparedStatement[] = [];
  for (const t of data.teams ?? []) {
    const teamId = t.tla ?? null; // 我們的 teams.id = tla
    for (const p of t.squad ?? []) {
      if (!p?.id) continue;
      stmts.push(
        env.DB.prepare(
          `INSERT INTO players (id, team_id, name, position, dob, nationality)
           VALUES (?1,?2,?3,?4,?5,?6)
           ON CONFLICT(id) DO UPDATE SET team_id=?2, name=?3, position=?4, dob=?5, nationality=?6`,
        ).bind(String(p.id), teamId, p.name ?? "", p.position ?? null, p.dateOfBirth ?? null, p.nationality ?? null),
      );
    }
  }
  for (const batch of chunk(stmts, 50)) await env.DB.batch(batch);
  await env.CACHE.put("squads:lastSync", new Date().toISOString());
  return { teams: (data.teams ?? []).length, players: stmts.length };
}

/**
 * 球員所屬俱樂部回填：football-data /persons/{id} 含 currentTeam（俱樂部名/隊徽/聯賽）。
 * 免費層 10 req/分，故每次只抓少量（cron 分批慢慢填）。429 限流即停，下次再續。
 * club_checked 標記避免「無俱樂部者」被反覆重抓。
 */
export async function syncPlayerClubs(env: Env, limit = 8): Promise<{ checked: number; withClub: number; remaining: number }> {
  if (!env.FOOTBALL_DATA_TOKEN) return { checked: 0, withClub: 0, remaining: 0 };

  // 仍在賽程上的球隊優先（已晉級16強 + 32強尚未開打）→ 淘汰隊最後補
  const { results: ko } = await env.DB.prepare(
    `SELECT home_id, away_id, status, winner, home_score, away_score, home_pens, away_pens
     FROM matches WHERE stage IN ('LAST_32','LAST_16','QUARTER_FINALS','SEMI_FINALS','FINAL')`,
  ).all<{ home_id: string | null; away_id: string | null; status: string; winner: string | null; home_score: number | null; away_score: number | null; home_pens: number | null; away_pens: number | null }>();
  const participants = new Set<string>(), eliminated = new Set<string>();
  for (const m of ko ?? []) {
    if (m.home_id) participants.add(m.home_id);
    if (m.away_id) participants.add(m.away_id);
    if (m.status !== "FINISHED") continue;
    let loser: string | null = null;
    if (m.winner === "HOME") loser = m.away_id;
    else if (m.winner === "AWAY") loser = m.home_id;
    else if (m.home_score != null && m.away_score != null) {
      if (m.home_score > m.away_score) loser = m.away_id;
      else if (m.away_score > m.home_score) loser = m.home_id;
      else if (m.home_pens != null && m.away_pens != null && m.home_pens !== m.away_pens)
        loser = m.home_pens > m.away_pens ? m.away_id : m.home_id;
    }
    if (loser) eliminated.add(loser);
  }
  const alive = [...participants].filter((t) => !eliminated.has(t));

  const binds: (string | number)[] = [limit];
  const inList = alive.map((t) => { binds.push(t); return `?${binds.length}`; }).join(",");
  const order = inList ? `CASE WHEN team_id IN (${inList}) THEN 0 ELSE 1 END, ` : "";
  const { results } = await env.DB.prepare(
    `SELECT id FROM players WHERE club_checked = 0 ORDER BY ${order}id LIMIT ?1`,
  ).bind(...binds).all<{ id: string }>();
  let checked = 0, withClub = 0;
  for (const p of results ?? []) {
    let res: Response;
    try {
      res = await fetch(`${BASE}/persons/${p.id}`, {
        headers: { "X-Auth-Token": env.FOOTBALL_DATA_TOKEN },
        signal: AbortSignal.timeout(15_000),
      });
    } catch { break; }
    if (res.status === 429) break; // 限流 → 留待下次
    if (!res.ok) {
      await env.DB.prepare(`UPDATE players SET club_checked=1 WHERE id=?1`).bind(p.id).run();
      checked++;
      continue;
    }
    const d = (await res.json()) as any;
    const ct = d.currentTeam;
    const comps = (ct?.runningCompetitions ?? []) as any[];
    // 取「聯賽」而非盃賽（[0] 常是超級盃/洲際盃）
    const leagueComp = comps.find((c) => c.type === "LEAGUE") ?? comps[0];
    const league = leagueComp?.code ?? leagueComp?.name ?? null;
    // 只有國家隊競賽（WC）→ currentTeam 是國家隊，該員俱樂部不在追蹤聯賽內 → 視為無俱樂部
    const isNational = !ct || comps.length === 0 || comps.every((c: any) => c.code === "WC");
    const club = isNational ? null : (ct.shortName ?? ct.name ?? null);
    const crest = isNational ? null : (ct.crest ?? null);
    const leagueOut = isNational ? null : league;
    await env.DB.prepare(
      `UPDATE players SET club=?2, club_crest=?3, club_league=?4, club_checked=1 WHERE id=?1`,
    ).bind(p.id, club, crest, leagueOut).run();
    if (club) withClub++;
    checked++;
  }
  const rem = await env.DB.prepare(`SELECT COUNT(*) AS n FROM players WHERE club_checked = 0`).first<{ n: number }>();
  return { checked, withClub, remaining: rem?.n ?? 0 };
}

function chunk<T>(arr: T[], n: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n));
  return out;
}
