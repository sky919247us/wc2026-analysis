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
const TARGET = "https://activation.sportslottery.com.tw/sportsbook";

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

// 點進「足球」運動分類，再點第一場賽事，觸發賠率端點
async function clickText(text) {
  try {
    const el = page.getByText(text, { exact: false }).first();
    await el.click({ timeout: 8000 });
    return true;
  } catch { return false; }
}
// 點側欄「足球」運動（exact 比對，避開 Top-bets 的足球分頁）
let clicked = false;
const soccer = page.getByText("足球", { exact: true });
const n = await soccer.count();
console.log(`足球 candidates: ${n}`);
for (let i = 0; i < n; i++) {
  try {
    await soccer.nth(i).click({ timeout: 5000 });
    console.log(`clicked 足球 #${i}`);
    await page.waitForTimeout(5000);
    clicked = true;
    break;
  } catch { /* try next */ }
}
await page.waitForTimeout(6000);
// 點第一場賽事的賠率/隊名，觸發 market 載入
for (const sel of ["[class*=Participant]", "[class*=participant]", "[class*=outcome]", "[class*=Outcome]", "[class*=selection]", "[class*=event] a", "[class*=Event] a"]) {
  try { await page.locator(sel).first().click({ timeout: 4000 }); console.log("clicked", sel); break; } catch {}
}
await page.waitForTimeout(8000);

console.log(`total captured responses: ${captured.length}`);
await mkdir("captured", { recursive: true });
for (let i = 0; i < captured.length; i++) {
  await writeFile(
    `captured/${String(i).padStart(3, "0")}.json`,
    `// ${captured[i].url}\n${captured[i].body}`,
  );
}
await writeFile("captured/_requests.json", JSON.stringify(requestLog, null, 2));
console.log(`logged ${requestLog.length} /services/ requests`);

// === 第一次實跑後，依 captured/ 的真實結構實作 ===
function parseOdds(_captured) {
  // TODO: 回傳 [{ match_id, market, line, selection, odds }]
  // match_id 對映：用隊名中文 → teams 表 TLA（Worker 端已有 name_zh）
  return [];
}

const snapshots = parseOdds(captured);
if (snapshots.length) {
  const res = await fetch(`${API_BASE}/api/admin/odds-ingest`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-admin-key": ADMIN_KEY },
    body: JSON.stringify({ source: "tw", snapshots }),
  });
  console.log(`ingest: ${res.status} ${await res.text()}`);
} else {
  console.log("no snapshots parsed yet (structure analysis run)");
}

await browser.close();
