import type { LLMEnv } from "./llm/provider";

export interface Env extends LLMEnv {
  DB: D1Database;
  CACHE: KVNamespace;
  FOOTBALL_DATA_TOKEN?: string;
  ODDS_API_KEY?: string;
  ODDS_API_KEY2?: string; // The Odds API 第二把（輪替）
  ODDS_API_KEY3?: string; // The Odds API 第三把（輪替）
  ODDSPAPI_KEY?: string;
  TELEGRAM_BOT_TOKEN?: string;
  TELEGRAM_WEBHOOK_SECRET?: string;
  ADMIN_KEY?: string; // /api/admin/* 手動觸發用
}
