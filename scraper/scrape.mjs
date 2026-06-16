/**
 * 台灣運彩賠率爬蟲（在本機執行，headful 通過 Cloudflare）
 *
 * 抓兩個頁面：
 *   賽前：/sportsbook/sport/足球/34740.1（2026世界盃 coupon）
 *   場中：/sportsbook/in-play（進行中比賽，賠率在此而非賽前頁）
 * 用 aria-label 解析（不讓分=1x2、[總分]大小2.5=大小球），對映我們的 match，
 * POST 進 /api/admin/odds-ingest（source="tw"）。
 *
 * 鎖盤/關盤處理：附加式快照——鎖盤的場次這輪抓不到值就略過，
 * 資料庫保留上一次的最新快照，下輪有新值再更新（不會洗掉舊資料）。
 *
 * 環境變數：WC_API_BASE、WC_ADMIN_KEY、HEADLESS（0=開視窗，過質詢用）
 */
import { chromium } from "playwright";

const API_BASE = process.env.WC_API_BASE ?? "https://wc2026-api.sky919247us.workers.dev";
const ADMIN_KEY = process.env.WC_ADMIN_KEY;
if (!ADMIN_KEY) { console.error("WC_ADMIN_KEY not set"); process.exit(1); }

const PRE_URL = `https://www.sportslottery.com.tw/sportsbook/sport/${encodeURIComponent("足球")}/34740.1`;
const LIVE_URL = "https://www.sportslottery.com.tw/sportsbook/in-play";

const browser = await chromium.launch({
  headless: process.env.HEADLESS !== "0",
  args: ["--disable-blink-features=AutomationControlled"],
});
const ctx = await browser.newContext({
  locale: "zh-TW", timezoneId: "Asia/Taipei",
  userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
  viewport: { width: 1366, height: 900 },
});
const page = await ctx.newPage();

async function passChallenge() {
  for (let i = 0; i < 12; i++) {
    if (!/just a moment/i.test(await page.title())) return;
    await page.waitForTimeout(5000);
  }
}
async function acceptCookie() {
  for (const kw of ["接受", "Accept", "我同意", "同意"]) {
    try { const b = page.getByText(kw, { exact: true }).first(); if (await b.count()) { await b.click({ timeout: 4000 }); await page.waitForTimeout(1200); return; } } catch {}
  }
}

/** 依 DOM 順序擷取：每場 = 2 隊名(客,主) + 其後賠率格(aria-label) */
function extractCoupon() {
  return page.evaluate(() => {
    const nodes = document.querySelectorAll('p.fwtEZm, [role="checkbox"][aria-label*=" - odds "]');
    const matches = [];
    let cur = null, names = [];
    for (const el of nodes) {
      if (el.tagName === "P") {
        names.push(el.textContent.trim());
        if (names.length === 2) { cur = { away: names[0], home: names[1], sel: [] }; matches.push(cur); names = []; }
      } else if (cur) {
        const m = (el.getAttribute("aria-label") || "").match(/^(.*) - (.*) - odds ([\d.]+)$/);
        if (m) cur.sel.push({ market: m[1], selection: m[2], odds: parseFloat(m[3]) });
        names = [];
      }
    }
    return matches.filter((x) => x.sel.length);
  });
}

const coupon = [];
// --- 賽前頁（同時負責通過 Cloudflare 質詢、接受 cookie）---
console.log("抓取賽前頁 ...");
await page.goto(PRE_URL, { waitUntil: "domcontentloaded", timeout: 60_000 });
await passChallenge();
await acceptCookie();
await page.waitForTimeout(8000);
const pre = await extractCoupon();
console.log(`  賽前 ${pre.length} 場`);
coupon.push(...pre);

// --- 冠軍盤（同頁切「冠軍及特別項目」分頁）---
let outrightItems = [];
try {
  await page.getByText("冠軍及特別項目", { exact: false }).first().click({ timeout: 8000 });
  await page.waitForTimeout(7000);
  outrightItems = await page.evaluate(() => {
    const out = [];
    document.querySelectorAll('[role="checkbox"][aria-label^="2026世界盃冠軍 - "]').forEach((el) => {
      const m = (el.getAttribute("aria-label") || "").match(/^2026世界盃冠軍 - (.+) - odds ([\d.]+)$/);
      if (m) out.push({ team: m[1], odds: parseFloat(m[2]) });
    });
    return out;
  });
  console.log(`  冠軍盤 ${outrightItems.length} 隊`);
  // 切回賽事分頁供後續（場中頁是另開網址，這裡不必）
} catch (e) { console.log("  冠軍盤略過:", e.message); }

// --- 場中頁（cookie/cf_clearance 已在 context，免再過質詢）---
try {
  console.log("抓取場中頁 ...");
  await page.goto(LIVE_URL, { waitUntil: "domcontentloaded", timeout: 60_000 });
  await passChallenge();
  await page.waitForTimeout(8000);
  const live = await extractCoupon();
  console.log(`  場中 ${live.length} 場`);
  coupon.push(...live);
} catch (e) { console.log("  場中頁略過:", e.message); }

// --- 對映我們的 match 並寫入 ---
const ourMatches = (await (await fetch(`${API_BASE}/api/matches`)).json()).matches ?? [];
const teams = (await (await fetch(`${API_BASE}/api/teams`)).json()).teams ?? [];
const zhToTla = {};
for (const t of teams) zhToTla[t.name_zh] = t.id;
Object.assign(zhToTla, { "波赫": "BIH", "民主剛果": "COD", "韓國": "KOR", "南韓": "KOR" });

function toSnapshots(c) {
  const t1 = zhToTla[c.away], t2 = zhToTla[c.home];
  if (!t1 || !t2) return null;
  const match = ourMatches.find((m) =>
    (m.home_id === t1 && m.away_id === t2) || (m.home_id === t2 && m.away_id === t1));
  if (!match) return null;
  const mid = match.match_id ?? match.id;
  const snaps = [];
  for (const s of c.sel) {
    if (s.market === "不讓分") {
      let sel = s.selection === "和局" ? "draw"
        : zhToTla[s.selection] === match.home_id ? "home"
        : zhToTla[s.selection] === match.away_id ? "away" : null;
      if (sel) snaps.push({ match_id: mid, market: "1x2", selection: sel, odds: s.odds });
    } else if (s.market.includes("大小")) {
      const sel = s.selection.startsWith("大") ? "over" : s.selection.startsWith("小") ? "under" : null;
      if (sel) snaps.push({ match_id: mid, market: "total", line: 2.5, selection: sel, odds: s.odds });
    } else if (s.market.startsWith("讓分")) {
      // "讓分 3:0 - 海地 3:0 - odds 1.65" → 歐洲讓分（整數讓球）
      const line = parseInt((s.market.match(/(\d+):0/) || [])[1] || "0", 10);
      const teamTxt = s.selection.replace(/\s*\d+:0\s*$/, "").trim();
      let sel = teamTxt === "和局" ? "draw"
        : zhToTla[teamTxt] === match.home_id ? "home"
        : zhToTla[teamTxt] === match.away_id ? "away" : null;
      if (sel && line > 0) snaps.push({ match_id: mid, market: "handicap", line, selection: sel, odds: s.odds });
    }
  }
  return { label: `${match.home_zh} vs ${match.away_zh}`, snaps };
}

// 同場可能賽前+場中都抓到 → 合併快照（皆寫入，讀取時取最新）
const allSnaps = [], matched = new Set();
for (const c of coupon) {
  const r = toSnapshots(c);
  if (r && r.snaps.length) { allSnaps.push(...r.snaps); matched.add(r.label); }
}
let total = 0;
if (allSnaps.length) {
  const res = await fetch(`${API_BASE}/api/admin/odds-ingest`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-admin-key": ADMIN_KEY },
    body: JSON.stringify({ source: "tw", snapshots: allSnaps }),
  });
  total = (await res.json()).inserted ?? 0;
}
console.log(`✅ 寫入 ${total} 筆台灣運彩賠率，對映 ${matched.size} 場`);
[...matched].forEach((m) => console.log("  ✓ " + m));

// 冠軍盤寫入（team 中文名 → TLA）
if (outrightItems.length) {
  const items = outrightItems.map((o) => ({ team_id: zhToTla[o.team], odds: o.odds })).filter((x) => x.team_id);
  if (items.length) {
    const res = await fetch(`${API_BASE}/api/admin/outright-ingest`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-admin-key": ADMIN_KEY },
      body: JSON.stringify({ source: "tw", items }),
    });
    console.log(`✅ 冠軍盤寫入 ${(await res.json()).inserted} 隊`);
  }
}

await browser.close();
