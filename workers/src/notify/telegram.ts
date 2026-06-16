/**
 * Telegram 推播：盤口異動警報 → 推到訂閱的 chat。
 * 訂閱者 chat_id 存 KV（key: "tg:subs" 的 JSON 陣列），由 webhook 處理 /start 加入。
 *
 * 設定：
 *   TELEGRAM_BOT_TOKEN  (secret)  — BotFather 取得
 *   選用 TELEGRAM_WEBHOOK_SECRET   — 驗證 webhook 來源
 */
import type { Env } from "../env";

const api = (token: string, method: string) => `https://api.telegram.org/bot${token}/${method}`;

export async function sendMessage(env: Env, chatId: string | number, text: string): Promise<boolean> {
  if (!env.TELEGRAM_BOT_TOKEN) return false;
  const res = await fetch(api(env.TELEGRAM_BOT_TOKEN, "sendMessage"), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text, parse_mode: "HTML", disable_web_page_preview: true }),
    signal: AbortSignal.timeout(15_000),
  });
  return res.ok;
}

async function getSubs(env: Env): Promise<number[]> {
  const raw = await env.CACHE.get("tg:subs");
  return raw ? JSON.parse(raw) : [];
}
async function setSubs(env: Env, subs: number[]): Promise<void> {
  await env.CACHE.put("tg:subs", JSON.stringify([...new Set(subs)]));
}

/** 廣播給所有訂閱者 */
export async function broadcast(env: Env, text: string): Promise<number> {
  const subs = await getSubs(env);
  let sent = 0;
  for (const id of subs) if (await sendMessage(env, id, text)) sent++;
  return sent;
}

/** 處理 Telegram webhook：/start 訂閱、/stop 退訂、/status 查詢 */
export async function handleWebhook(env: Env, update: any): Promise<void> {
  const msg = update.message ?? update.edited_message;
  const chatId: number | undefined = msg?.chat?.id;
  const text: string = (msg?.text ?? "").trim();
  if (!chatId) return;

  const subs = await getSubs(env);
  if (text.startsWith("/start")) {
    await setSubs(env, [...subs, chatId]);
    await sendMessage(env, chatId,
      "✅ <b>已訂閱 WC2026 盤口異動推播！</b>\n\n當偵測到大額資金介入、賠率急降等異動時，會即時通知你。\n\n指令：/stop 退訂・/status 查訂閱狀態\n\n⚠️ 僅供參考，未滿18歲不得購買運動彩券，請理性投注。");
  } else if (text.startsWith("/stop")) {
    await setSubs(env, subs.filter((id) => id !== chatId));
    await sendMessage(env, chatId, "已退訂盤口推播。隨時 /start 可重新訂閱。");
  } else if (text.startsWith("/status")) {
    const on = subs.includes(chatId);
    await sendMessage(env, chatId, on ? "✅ 你已訂閱盤口異動推播。" : "尚未訂閱，傳送 /start 開始。");
  } else {
    await sendMessage(env, chatId, "WC2026 盤口推播機器人\n/start 訂閱・/stop 退訂・/status 查詢");
  }
}

/** 把一筆 odds_alert 格式化成推播訊息 */
export function formatAlert(a: { home_zh: string; away_zh: string; detail: string; severity: number }): string {
  const dot = a.severity >= 60 ? "🔴" : a.severity >= 35 ? "🟡" : "🟢";
  return `${dot} <b>盤口異動警報</b>\n\n⚽ ${a.home_zh} vs ${a.away_zh}\n📊 ${a.detail}\n異動分數：${a.severity}\n\n<i>僅供參考・理性投注</i>`;
}
