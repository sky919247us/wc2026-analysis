/**
 * 台灣運彩賠率爬蟲（方案 A）
 *
 * 跑在 GitHub Actions（或任何有瀏覽器的環境），用 Playwright 開真實 Chromium
 * 通過 Cloudflare Managed Challenge，攔截 SPA 載入賠率時的 XHR/fetch 回應，
 * 解析後 POST 回 Worker 的 /api/admin/odds-ingest 存入 D1。
 *
 * 環境變數：
 *   WC_API_BASE   Worker 網址（預設正式站）
 *   WC_ADMIN_KEY  寫入口密鑰（必填）
 *
 * ⚠️ 攔截到的 API 結構要等第一次實跑才能確認 —— 先把所有 JSON 回應
 *    存到 captured/ 供分析，確認結構後再填 parseOdds()。
 */
import { chromium } from "playwright";
import { mkdir, writeFile } from "node:fs/promises";

const API_BASE = process.env.WC_API_BASE ?? "https://wc2026-api.sky919247us.workers.dev";
const ADMIN_KEY = process.env.WC_ADMIN_KEY;
// 足球 coupon 直達網址（節點 34740.1）——不需登入即顯示「2026世界盃」全部賠率
const TARGET = `https://www.sportslottery.com.tw/sportsbook/sport/${encodeURIComponent("足球")}/34740.1`;

if (!ADMIN_KEY) {
  console.error("WC_ADMIN_KEY not set");
  process.exit(1);
}

const captured = [];

const HEADLESS = process.env.HEADLESS !== "0"; // HEADLESS=0 開真實視窗（較易過 Cloudflare 質詢）
const browser = await chromium.launch({
  headless: HEADLESS,
  args: ["--disable-blink-features=AutomationControlled"],
});
const ctx = await browser.newContext({
  locale: "zh-TW",
  timezoneId: "Asia/Taipei",
  userAgent:
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
  viewport: { width: 1366, height: 900 },
});
const page = await ctx.newPage();

const requestLog = [];
// 記錄所有 /services/ 請求（method + url + POST body）→ 找賠率端點規律
page.on("request", (req) => {
  const u = req.url();
  if (/\/services\//.test(u)) {
    requestLog.push({ method: req.method(), url: u, post: req.postData() ?? null });
  }
});

// 攔截 /services/ 的 JSON 回應全留（賠率就在其中）
page.on("response", async (res) => {
  try {
    const url = res.url();
    if (!/\/services\//.test(url)) return;
    const ct = res.headers()["content-type"] ?? "";
    if (!ct.includes("json")) return;
    const body = await res.text();
    captured.push({ url, body });
    console.log(`captured: ${url} (${body.length} bytes)`);
  } catch { /* response already disposed */ }
});

console.log(`navigating to ${TARGET} ...`);
await page.goto(TARGET, { waitUntil: "domcontentloaded", timeout: 60_000 });

// 等 Cloudflare 質詢通過（頁面標題離開 "Just a moment..."）
for (let i = 0; i < 12; i++) {
  const title = await page.title();
  if (!/just a moment/i.test(title)) break;
  console.log(`waiting for challenge... (${title})`);
  await page.waitForTimeout(5000);
}

await page.waitForTimeout(8000);
await mkdir("captured", { recursive: true });

// 勘查模式：把渲染後的 DOM + 截圖存下，分析賠率元素結構
async function snapshot(tag) {
  try {
    await page.screenshot({ path: `captured/${tag}.png`, fullPage: true });
    await writeFile(`captured/${tag}.html`, await page.content());
    // 掃描畫面上「賠率樣式」的數字（1.01~99.0）與其所在元素結構
    const probe = await page.evaluate(() => {
      const out = [];
      const re = /^\d{1,2}\.\d{1,2}$/;
      const all = document.querySelectorAll("*");
      let count = 0;
      for (const el of all) {
        const t = (el.textContent || "").trim();
        if (re.test(t) && el.children.length === 0) {
          count++;
          if (out.length < 8) {
            // 往上 4 層記下 class，幫助找選擇器
            let p = el, chain = [];
            for (let i = 0; i < 4 && p; i++) { chain.push(`${p.tagName}.${(p.className||"").toString().slice(0,40)}`); p = p.parentElement; }
            out.push({ odds: t, chain });
          }
        }
      }
      return { oddsLikeCount: count, samples: out };
    });
    console.log(`[${tag}] 賠率樣式數字: ${probe.oddsLikeCount}`);
    probe.samples.forEach(s => console.log(`  ${s.odds}  <= ${s.chain.join(" < ")}`));
  } catch (e) { console.log(`snapshot ${tag} failed: ${e.message}`); }
}

// 接受 cookie
for (const kw of ["接受", "Accept", "我同意", "同意"]) {
  try { const b = page.getByText(kw, { exact: true }).first(); if (await b.count()) { await b.click({ timeout: 4000 }); await page.waitForTimeout(1500); break; } } catch {}
}
await page.waitForTimeout(8000); // 等世界盃賠率渲染

// 依 DOM 順序擷取：每場 = 2 隊名(客,主) + 其後的賠率格(aria-label)
const coupon = await page.evaluate(() => {
  const nodes = document.querySelectorAll('p.fwtEZm, [role="checkbox"][aria-label*=" - odds "]');
  const matches = [];
  let cur = null, names = [];
  for (const el of nodes) {
    if (el.tagName === "P") {
      names.push(el.textContent.trim());
      if (names.length === 2) { cur = { away: names[0], home: names[1], sel: [] }; matches.push(cur); names = []; }
    } else if (cur) {
      const lbl = el.getAttribute("aria-label"); // "市場 - 選項 - odds 1.18"
      const m = lbl.match(/^(.*) - (.*) - odds ([\d.]+)$/);
      if (m) cur.sel.push({ market: m[1], selection: m[2], odds: parseFloat(m[3]) });
      names = []; // 賠率出現後重置隊名累積
    }
  }
  return matches.filter((x) => x.sel.length);
});
console.log(`擷取到 ${coupon.length} 場運彩賠率`);

// 取我們的未開賽比賽 + 球隊中文名→TLA
const ourMatches = (await (await fetch(`${API_BASE}/api/matches?upcoming=1`)).json()).matches ?? [];
const teams = (await (await fetch(`${API_BASE}/api/teams`)).json()).teams ?? [];
const zhToTla = {};
for (const t of teams) zhToTla[t.name_zh] = t.id;
// 台灣運彩用名 → 我們的 TLA 別名
Object.assign(zhToTla, { "波赫": "BIH", "民主剛果": "COD", "韓國": "KOR", "南韓": "KOR" });

function toSnapshots(c) {
  // 兩隊（順序不定）→ TLA；用集合配對我們的 match，再依 DB 主客標記
  const t1 = zhToTla[c.away], t2 = zhToTla[c.home];
  if (!t1 || !t2) return null;
  const match = ourMatches.find((m) =>
    (m.home_id === t1 && m.away_id === t2) || (m.home_id === t2 && m.away_id === t1));
  if (!match) return null;
  const mid = match.match_id ?? match.id;
  const snaps = [];
  for (const s of c.sel) {
    if (s.market === "不讓分") {
      let sel = null;
      if (s.selection === "和局") sel = "draw";
      else {
        const selTla = zhToTla[s.selection]; // 該選項隊伍 → 對映我們 DB 的主/客
        if (selTla === match.home_id) sel = "home";
        else if (selTla === match.away_id) sel = "away";
      }
      if (sel) snaps.push({ match_id: mid, market: "1x2", selection: sel, odds: s.odds });
    } else if (s.market.includes("大小")) {
      const sel = s.selection.startsWith("大") ? "over" : s.selection.startsWith("小") ? "under" : null;
      if (sel) snaps.push({ match_id: mid, market: "total", line: 2.5, selection: sel, odds: s.odds });
    }
  }
  return { mid, label: `${match.home_zh} vs ${match.away_zh}`, snaps };
}

let total = 0; const matched = [], unmatched = [];
const allSnaps = [];
for (const c of coupon) {
  const r = toSnapshots(c);
  if (r && r.snaps.length) { allSnaps.push(...r.snaps); matched.push(r.label); }
  else unmatched.push(`${c.away} @ ${c.home}`);
}
if (allSnaps.length) {
  const res = await fetch(`${API_BASE}/api/admin/odds-ingest`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-admin-key": ADMIN_KEY },
    body: JSON.stringify({ source: "tw", snapshots: allSnaps }),
  });
  const j = await res.json();
  total = j.inserted ?? 0;
}
console.log(`✅ 寫入 ${total} 筆台灣運彩賠率，對映 ${matched.length} 場`);
matched.forEach((m) => console.log("  ✓ " + m));
if (unmatched.length) { console.log(`未對映 ${unmatched.length} 場：`); unmatched.forEach((m) => console.log("  ✗ " + m)); }

await browser.close();
