# wc2026-analysis

世界盃 2026 賽事分析網站 — 以**台灣運彩**為主推下注源（台灣唯一合法），國際盤（Pinnacle / Bet365）作為機率基準與輔助對比。

> ⚠️ 本站僅提供分析資訊，不構成投注建議。未滿 18 歲不得購買運動彩券，請理性投注。

## 架構

GitHub + Cloudflare 免費層：Pages（前端）+ Workers/Cron（抓取與 API）+ D1（資料庫）+ KV（快取）。
詳見 [ARCHITECTURE.md](ARCHITECTURE.md)。

```
web/        前端 SPA（Cloudflare Pages）
workers/    API + cron 排程（wrangler deploy）
  src/llm/  LLM 多供應商抽象層（OpenAI 相容端點 / Claude，fallback chain）
db/         D1 schema 與 migrations
```

## 核心功能

- 台灣運彩玩法（不讓分/讓分/大小/正確比數）+ **EV 期望值**標示
- 五模型融合預測（Elo / Poisson / 特徵 / 市場去水 / 加權融合）
- 盤口異動監控 + Telegram 推播
- LLM 白話文分析報告（多供應商可切換）
- 公開戰績對帳頁（命中率 / ROI）

## 開發

```bash
cd workers
npm install
npx wrangler dev          # 本地開發（secrets 放 .dev.vars，不進 repo）
npx wrangler deploy       # 部署
```

Secrets 一律 `wrangler secret put <NAME>`：`OPENAI_API_KEY`、`ODDS_API_KEY`、`FOOTBALL_DATA_TOKEN`、`TELEGRAM_BOT_TOKEN`。
