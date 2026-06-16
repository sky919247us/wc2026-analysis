import type { LLMEnv } from "./llm/provider";

export interface Env extends LLMEnv {
  DB: D1Database;
  CACHE: KVNamespace;
  FOOTBALL_DATA_TOKEN?: string;
  ODDS_API_KEY?: string;
  ODDS_API_KEY2?: string; // The Odds API 追加把數（輪替；可一直加到 KEY9）
  ODDS_API_KEY3?: string;
  ODDS_API_KEY4?: string;
  ODDS_API_KEY5?: string;
  ODDS_API_KEY6?: string;
  ODDS_API_KEY7?: string;
  ODDS_API_KEY8?: string;
  ODDS_API_KEY9?: string;
  ODDSPAPI_KEY?: string;
  TELEGRAM_BOT_TOKEN?: string;
  TELEGRAM_WEBHOOK_SECRET?: string;
  ADMIN_KEY?: string; // /api/admin/* 手動觸發用
}
