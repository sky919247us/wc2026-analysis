/**
 * 冠軍盤（outright winner）：
 * - 參考盤用 The Odds API 的 soccer_fifa_world_cup_winner（優先 Betfair 交易所，水位最低）
 *   去水後當「真實奪冠機率」基準，存 outright_odds（source="market"）
 * - 台灣運彩冠軍盤由爬蟲灌入（source="tw"）
 * 一天抓一次即可（1 credit）。
 */
import type { Env } from "../env";
import { NAME_TO_TLA } from "./teamNames";

const SPORT = "soccer_fifa_world_cup_winner";

export async function syncOutright(env: Env): Promise<{ inserted: number; book: string }> {
  const keys = [env.ODDS_API_KEY, env.ODDS_API_KEY2, env.ODDS_API_KEY3, env.ODDS_API_KEY4, env.ODDS_API_KEY5]
    .filter((k): k is string => !!k);
  if (!keys.length) throw new Error("no ODDS_API_KEY");
  const key = keys[0];

  const res = await fetch(
    `https://api.the-odds-api.com/v4/sports/${SPORT}/odds?regions=eu&markets=outrights&oddsFormat=decimal&apiKey=${key}`,
    { signal: AbortSignal.timeout(30_000) },
  );
  if (!res.ok) throw new Error(`outright ${res.status}`);
  const data = (await res.json()) as any[];
  const books = data[0]?.bookmakers ?? [];
  // 優先 Betfair 交易所（最準）→ William Hill → 第一個
  const book = books.find((b: any) => b.key === "betfair_ex_eu") ?? books.find((b: any) => b.key === "williamhill") ?? books[0];
  if (!book) return { inserted: 0, book: "none" };

  const outcomes = (book.markets?.[0]?.outcomes ?? []) as { name: string; price: number }[];
  const now = new Date().toISOString();
  const stmts = outcomes
    .map((o) => ({ tla: NAME_TO_TLA[o.name], odds: o.price }))
    .filter((x) => x.tla && x.odds > 1)
    .map((x) =>
      env.DB.prepare(`INSERT INTO outright_odds (source, team_id, odds, captured_at) VALUES ('market', ?1, ?2, ?3)`)
        .bind(x.tla, x.odds, now),
    );
  for (let i = 0; i < stmts.length; i += 30) await env.DB.batch(stmts.slice(i, i + 30));
  await env.CACHE.put("outright:lastSync", now);
  return { inserted: stmts.length, book: book.key };
}
