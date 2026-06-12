# WC2026 台灣運彩分析網站 — 架構文件

> 目標：GitHub + Cloudflare 全免費層架設世界盃 2026 分析網站。
> 主推下注源：**台灣運彩**（台灣唯一合法）；Bet365 / Pinnacle 等國際盤僅作機率基準與輔助對比。

## 1. 整體架構

```
GitHub（程式碼 + Actions 備援排程） → 自動部署 → Cloudflare
├─ Pages：前端 SPA（繁體中文）
├─ Workers + Cron Triggers：資料抓取排程 + REST API
├─ D1 (SQLite)：賽程 / 賠率快照 / 球隊 / 新聞 / 預測 / 對帳
└─ KV：熱資料快取（首頁賠率、最新預測）
```

### Cron 排程分配（免費層 5 個 Cron Trigger）
| 頻率 | 任務 |
|---|---|
| 每 5 分鐘 | 台灣運彩賠率快照 + 異動偵測 |
| 每 15 分鐘 | 國際賠率（The Odds API：Pinnacle、Bet365） |
| 每 30 分鐘 | 新聞 RSS（BBC / ESPN / 聯合新聞網） |
| 每小時 | 傷停名單、球隊近況、Elo 更新 |
| 賽後（每小時檢查） | 比分回填 → 預測對帳 → 戰績統計 |

## 2. 資料來源

| 資料 | 來源 | 備註 |
|---|---|---|
| 台灣運彩賠率 | 官網 SPA 內部 JSON endpoint | 無官方 API；模組必須隔離、容錯（抓不到顯示上次快照+時間戳）；GitHub Actions 作備援 IP 池 |
| 國際賠率 | The Odds API（免費 500 credits/月）或 OddsPapi | 重點抓 Pinnacle（去水後當「真實機率」基準）|
| 賽程/比分/陣容 | football-data.org（免費含世界盃）+ API-Football 免費層 | |
| 新聞 | RSS 聚合 | 免爬蟲、穩定 |
| AI 白話報告 | 多供應商 LLM 抽象層（見 §4） | |

## 3. 模型管線（純計算，跑在 Cron Worker 內）

1. **Elo 實力模型**（世界盃權重 K=60）
2. **Poisson / xG 進球模型** → 比分分佈、大小球、雙方進球
3. **特徵加權模型**（近況、傷停、休息天數）
4. **市場信號**：Pinnacle 賠率去水（margin removal）→ 隱含真實機率
5. **加權融合** → 主/平/客機率、信心指數、爆冷指數、風險評級
6. **台灣運彩玩法對映 + EV 計算**：
   - `EV = 真實機率 × 運彩賠率 − 1`，正 EV 標綠
   - 玩法：不讓分 / 讓分 / 大小 / 正確比數 / 串關建議（2-3 串低相關組合）
   - 運彩 vs 國際盤價差雷達：價值場次置頂

## 4. LLM 多供應商抽象層

設計原則：**報告生成只依賴統一介面 `LLMProvider`，供應商可隨時切換/降級**。

```
workers/src/llm/
├─ provider.ts      # 介面定義 + 工廠 + 容錯鏈（fallback chain）
├─ openai.ts        # GPT（含任何 OpenAI 相容端點：DeepSeek、Groq、Ollama…）
├─ anthropic.ts     # Claude
└─ gemini.ts        # Gemini（可後補）
```

- 設定驅動：環境變數 `LLM_PROVIDERS="openai:gpt-4o-mini,anthropic:claude-haiku"` 依序嘗試，前者失敗自動 fallback。
- API key 存 Cloudflare Secrets（`wrangler secret put OPENAI_API_KEY`），不進 repo。
- 每場比賽報告只生成一次並存 D1，重大盤口異動時才重生成 → 整屆成本極低。

## 5. 前端頁面

比分盤 / 賽事詳情（運彩玩法+EV）/ 積分榜 / 球隊庫 / 新聞 / AI 分析報告 / 盤口異動監控 / **戰績對帳頁（公開命中率與 ROI）** / Telegram 推播訂閱說明。

## 6. 合規

僅作分析資訊：不代購、不連投注、不收費代操。每頁掛「未滿 18 歲不得購買運彩；分析僅供參考，理性投注」。

## 7. 開發順序

1. 賽程 + 球隊 + 積分榜（football-data.org）
2. 台灣運彩賠率抓取 + 快照 + 異動偵測
3. 模型管線 + EV
4. LLM 白話報告 + Telegram 推播
5. 賽後對帳 + 戰績頁
