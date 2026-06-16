import type { LLMEnv } from "./llm/provider";

export interface Env extends LLMEnv {
  DB: D1Database;
  CACHE: KVNamespace;
  FOOTBALL_DATA_TOKEN?: string;
  ODDS_API_KEY?: string;
  ODDSPAPI_KEY?: string;
  TELEGRAM_BOT_TOKEN?: string;
  TELEGRAM_WEBHOOK_SECRET?: string;
  ADMIN_KEY?: string; // /api/admin/* 手動觸發用
}
