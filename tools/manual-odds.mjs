/**
 * 臨場手動加抓賠率（在「你的電腦」執行，不消耗 The Odds API 點數）
 *
 * 流程：本機(住宅IP) 抓 OddsPapi → 對映到我們的 match → POST 進 /api/admin/odds-ingest
 * OddsPapi 封鎖伺服器 IP，但住宅 IP 可用，所以這支必須在本機跑（不是 Worker）。
 *
 * 環境變數（由 manual-odds.ps1 注入）：
 *   ODDSPAPI_KEY, WC_ADMIN_KEY, WC_API_BASE
 */
const ODDSPAPI_KEY = process.env.ODDSPAPI_KEY;
const ADMIN_KEY = process.env.WC_ADMIN_KEY;
const API_BASE = process.env.WC_API_BASE ?? "https://wc2026-api.sky919247us.workers.dev";
if (!ODDSPAPI_KEY || !ADMIN_KEY) { console.error("缺 ODDSPAPI_KEY 或 WC_ADMIN_KEY"); process.exit(1); }

const PAPI = "https://api.oddspapi.io/v4";

// OddsPapi 隊名 → 我們的 TLA（與 Worker teamNames 對齊）
const NAME_TO_TLA = {
  "South Korea":"KOR","Korea Republic":"KOR","Czech Republic":"CZE","Czechia":"CZE",
  "Argentina":"ARG","France":"FRA","England":"ENG","Belgium":"BEL","Brazil":"BRA",
  "Portugal":"POR","Netherlands":"NED","Spain":"ESP","Uruguay":"URY","Colombia":"COL",
  "Germany":"GER","Morocco":"MAR","Japan":"JPN","Croatia":"CRO","United States":"USA","USA":"USA",
  "Mexico":"MEX","Senegal":"SEN","Denmark":"DEN","Switzerland":"SUI","Australia":"AUS",
  "Iran":"IRN","Ecuador":"ECU","Canada":"CAN","Qatar":"QAT","Wales":"WAL","New Zealand":"NZL",
  "South Africa":"RSA","Saudi Arabia":"KSA","Tunisia":"TUN","Nigeria":"NGA","Cameroon":"CMR",
  "Ghana":"GHA","Egypt":"EGY","Algeria":"ALG","Ivory Coast":"CIV","Panama":"PAN","Costa Rica":"CRC",
  "Honduras":"HON","Jamaica":"JAM","Paraguay":"PAR","Peru":"PER","Chile":"CHI","Venezuela":"VEN",
  "Bolivia":"BOL","Scotland":"SCO","Ireland":"IRL","Norway":"NOR","Sweden":"SWE","Poland":"POL",
  "Austria":"AUT","Serbia":"SRB","Turkey":"TUR","Ukraine":"UKR","Hungary":"HUN","Slovakia":"SVK",
  "Slovenia":"SVN","Romania":"ROU","Greece":"GRE","Albania":"ALB","Georgia":"GEO","Uzbekistan":"UZB",
  "Jordan":"JOR","Iraq":"IRQ","United Arab Emirates":"UAE","Curacao":"CUR","Curaçao":"CUR",
  "Haiti":"HAI","Cape Verde":"CPV","Cape Verde Islands":"CPV","Bosnia and Herzegovina":"BIH",
  "Bosnia-Herzegovina":"BIH","Bosnia & Herzegovina":"BIH","DR Congo":"COD","Congo DR":"COD","Italy":"ITA",
};

async function main() {
  // 1. 我們的未開賽比賽（取 match_id 與隊伍）
  const matches = (await (await fetch(`${API_BASE}/api/matches?upcoming=1`)).json()).matches ?? [];
  // 2. OddsPapi 世界盃 fixtures
  const from = new Date(Date.now() - 2*3600e3).toISOString().slice(0,10);
  const to = new Date(Date.now() + 36*3600e3).toISOString().slice(0,10);
  const fx = (await (await fetch(`${PAPI}/fixtures?sportId=10&from=${from}&to=${to}&apiKey=${ODDSPAPI_KEY}`)).json())
    .filter(f => f.tournamentName === "World Cup" && !/\bSRL\b/i.test(`${f.participant1Name} ${f.participant2Name}`));

  let totalInserted = 0; const done = [];
  // 只處理未來 36h 內、能對映的近期賽事
  const near = matches.filter(m => {
    const h = new Date(m.kickoff_utc).getTime() - Date.now();
    return h <= 36*3600e3 && h >= -2.5*3600e3;
  }).slice(0, 12);

  for (const m of near) {
    const f = fx.find(x => NAME_TO_TLA[x.participant1Name] === m.home_id
      && NAME_TO_TLA[x.participant2Name] === m.away_id
      && Math.abs(new Date(x.trueStartTime ?? x.startTime).getTime() - new Date(m.kickoff_utc).getTime()) < 4*3600e3);
    if (!f) continue;

    const od = await (await fetch(`${PAPI}/odds?fixtureId=${f.fixtureId}&bookmakers=pinnacle,bet365&apiKey=${ODDSPAPI_KEY}`)).json();
    const books = od.bookmakerOdds ?? {};
    for (const [slug, book] of Object.entries(books)) {
      const snaps = [];
      // 1X2（market 101）：101 主 / 102 和 / 103 客
      const m101 = book.markets?.["101"]?.outcomes;
      if (m101) for (const [oid, sel] of [["101","home"],["102","draw"],["103","away"]]) {
        const p = m101[oid]?.players?.["0"]?.price;
        if (p > 1) snaps.push({ match_id: m.match_id ?? m.id, market: "1x2", selection: sel, odds: p });
      }
      // 大小球主盤 2.5（market 1010）：1011 大 / 1010 小
      const m1010 = book.markets?.["1010"]?.outcomes;
      if (m1010) for (const [oid, sel] of [["1011","over"],["1010","under"]]) {
        const p = m1010[oid]?.players?.["0"]?.price;
        if (p > 1) snaps.push({ match_id: m.match_id ?? m.id, market: "total", line: 2.5, selection: sel, odds: p });
      }
      if (snaps.length) {
        const res = await fetch(`${API_BASE}/api/admin/odds-ingest`, {
          method: "POST",
          headers: { "content-type": "application/json", "x-admin-key": ADMIN_KEY },
          body: JSON.stringify({ source: slug, snapshots: snaps }),
        });
        const r = await res.json();
        totalInserted += r.inserted ?? 0;
        done.push(`${m.home_zh} vs ${m.away_zh} [${slug}] +${r.inserted}`);
      }
    }
  }
  console.log(`✅ 完成：寫入 ${totalInserted} 筆賠率（OddsPapi，零 Odds API 點數）`);
  done.forEach(d => console.log("  " + d));
  if (!done.length) console.log("（目前 36h 內沒有可對映的賽事，或尚無賠率）");
}
main().catch(e => { console.error("失敗：", e.message); process.exit(1); });
