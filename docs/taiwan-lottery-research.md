# 台灣運彩資料抓取 — 端點研究結論

研究日期：2026-06-12

## 核心結論

**台灣運彩沒有公開 API，且線上投注網站全程掛在 Cloudflare Managed Challenge（JS 質詢）後面。**
Cloudflare Worker 直接 `fetch` 只會拿到質詢頁（`Just a moment...`），拿不到賠率資料。
這代表「在 Worker 裡每 5 分鐘直接抓運彩」的原始計畫不可行，需改策略。

## 實測結果

| 端點 | 結果 |
|---|---|
| `www.sportslottery.com.tw/` | 200，但只回 3.6KB 的 SPA 殼，資料靠 JS 動態載入 |
| `www.sportslottery.com.tw/sportsbook/daily-coupons` | 同上，SPA 殼 |
| `activation.sportslottery.com.tw/sportsbook` | **Cloudflare Managed Challenge**（需執行 JS + cookie 才放行） |
| `api.sportslottery.com.tw` | 無此子網域 / 連線失敗 |
| `blob.sportslottery.com.tw/static/...` | 200，靜態 blob（投注說明頁），**無賠率、無 API 線索** |

平台技術：場中投注頁存在，平台疑似 **Kambi**（B2B 運彩平台）但未證實；前台為自建 SPA。

## 可行的抓取策略（依推薦度）

### 方案 A：瀏覽器自動化跑在 GitHub Actions（推薦）
- 用 Playwright 開真實 Chromium，自動通過 Cloudflare 質詢，讀取 SPA 渲染後的賠率。
- 跑在 GitHub Actions 排程（非 Cloudflare Worker，Worker 無瀏覽器環境）。
- 抓完把賠率 POST 回 Worker 的 `/api/admin/odds-ingest`（用 ADMIN_KEY 驗證）存入 D1。
- 優點：能拿到真實運彩盤。缺點：GitHub Actions 排程不準時（延遲 5-30 分）、Private repo 每月 2000 分鐘額度（足夠，每次跑約 1-2 分鐘）。

### 方案 B：cf_clearance cookie 中繼（半自動）
- 人工通過一次質詢取得 `cf_clearance` cookie（有效數小時～數天），存入 Worker secret，Worker 帶 cookie 抓。
- 優點：仍跑在 Worker、即時。缺點：cookie 會過期需定期手動更新，維護成本高。

### 方案 C：先用合法第三方賠率，運彩盤後補（務實起步）
- Phase 2 先接 The Odds API（國際盤 + Pinnacle 真實機率基準），先把 EV 引擎、盤口監控、模型跑起來。
- 運彩盤用方案 A 在背景補上，補到的場次顯示真實運彩賠率+EV，沒補到的先顯示國際盤估算。

## 建議落地順序

1. **先做方案 C 的骨架**：Worker 端 `/api/admin/odds-ingest`（通用賠率寫入）+ `odds_snapshots` 已有的 schema + EV 計算 + 盤口監控規則。資料源無關，先用 The Odds API 灌。
2. **再加方案 A**：寫一個獨立的 `scraper/`（Playwright + GitHub Actions），專門抓運彩盤回灌。這塊和主站解耦，掛了不影響網站。

## 實跑進展（2026-06-14，Playwright headful）

**已成功通過 Cloudflare 質詢**並逆向出平台協定：

- 平台網域：`www-talo-ssb-pr.sportslottery.com.tw`（SSB = SportsBook）
- 統一端點：`POST /services/content/get`，body：
  ```json
  {"contentId":{"type":"<型別>","id":"1355/<節點id>"},
   "clientContext":{"language":"ZH","ipAddress":"..."}}
  ```
  品牌碼固定 `1355`。
- 即時賠率：`POST /services/content/subscribe`（含 `subscriberId`）+ `unsubscribe`，
  回應僅 13 bytes ack → **賠率是推播串流，非單次 GET**（這是主要難點）。
- 已知 `contentId.type`：`boNavigationList`、`bannerCategoryList`、`headline`、
  `dbCoreDCParameter`、`liveStreamEventList`。
- 導覽樹（`boNavigationList 1355/top`）：足球 SPORT 節點 `id=34740.1`（67 聯賽）。
- 賠率欄位術語：`idfwbonavigation`、`numfwmarketgroups`（FSB 系平台）。

**剩餘缺口**：賠率經 subscribe 推播，且賽事/市場的 `contentId.type` 尚未捕捉到
（SPA 側欄足球導覽需更精準的 UI 操作才能進到賽事頁）。

**結論與建議改採 DOM 讀取**：與其逆向 subscribe 推播協定，不如讓 Playwright
渲染賽事頁後**直接讀 DOM 上顯示的賠率數字**（主/和/客、讓分、大小），更穩定、
不受 API 變動影響。代價是要對映賽事到我們的 match（用隊名）。

## 合規備註
- 只讀取公開展示的賠率資訊作分析，不自動下注、不破解登入。
- 抓取頻率保守（每 5-15 分鐘一次），避免造成對方負擔。
- 運彩端點隨時可能變動，scraper 要有「抓不到就保留上次快照 + 時間戳」的容錯。
