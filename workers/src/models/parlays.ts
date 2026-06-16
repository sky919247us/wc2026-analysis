/**
 * 串關（過關）建議：把不同場次的「正期望值單注」組合起來。
 * - 單注 EV：以 Pinnacle 去水機率為真實機率，乘台灣運彩賠率 −1
 * - 串關合併：賠率 = ∏odds、真實機率 = ∏trueProb、EV = ∏(1+EV_i) − 1
 *   （不同場次視為獨立事件 → 低相關；同場不同盤口相關，故每場最多取一注）
 */
import type { Env } from "../env";
import { removeMargin } from "./ev";

interface Leg {
  matchId: string; label: string; pick: string;
  twOdds: number; trueProb: number; ev: number; kickoff: string;
}

interface Row { match_id: string; source: string; market: string; line: number | null; selection: string; odds: number; captured_at: string }

const SEL_ZH: Record<string, string> = { home: "主勝", draw: "和局", away: "客勝", over: "大 2.5", under: "小 2.5" };

/** 取每場最新的 tw / pinnacle 1x2 + 大小球，算出每場「最佳 +EV 單注」 */
export async function bestLegs(env: Env, minEv = 0): Promise<Leg[]> {
  const { results } = await env.DB.prepare(
    `SELECT s.match_id, s.source, s.market, s.line, s.selection, s.odds, s.captured_at,
            h.name_zh AS home_zh, a.name_zh AS away_zh, m.kickoff_utc
     FROM odds_snapshots s
     JOIN matches m ON m.id = s.match_id
     JOIN teams h ON h.id = m.home_id
     JOIN teams a ON a.id = m.away_id
     WHERE m.status = 'SCHEDULED' AND m.kickoff_utc >= datetime('now','-2 hours')
       AND s.source IN ('tw','pinnacle') AND s.market IN ('1x2','total')
     ORDER BY s.captured_at DESC LIMIT 4000`,
  ).all<Row & { home_zh: string; away_zh: string; kickoff_utc: string }>();

  // 每場 → {source → {market → {selection → odds(最新)}}}
  type Match = { home_zh: string; away_zh: string; kickoff: string; o: Record<string, Record<string, Record<string, number>>> };
  const byMatch = new Map<string, Match>();
  for (const r of results ?? []) {
    let mm = byMatch.get(r.match_id);
    if (!mm) { mm = { home_zh: (r as any).home_zh, away_zh: (r as any).away_zh, kickoff: (r as any).kickoff_utc, o: {} }; byMatch.set(r.match_id, mm); }
    const src = (mm.o[r.source] ??= {});
    const mk = (src[r.market] ??= {});
    if (mk[r.selection] === undefined) mk[r.selection] = r.odds; // 已按時間 desc，首次即最新
  }

  const legs: Leg[] = [];
  for (const [matchId, mm] of byMatch) {
    const cands: Leg[] = [];
    const tw = mm.o.tw, pin = mm.o.pinnacle;
    if (!tw || !pin) continue;
    const label = `${mm.home_zh} vs ${mm.away_zh}`;

    // 1x2
    if (tw["1x2"] && pin["1x2"]?.home && pin["1x2"]?.draw && pin["1x2"]?.away) {
      const probs = removeMargin([pin["1x2"].home, pin["1x2"].draw, pin["1x2"].away]);
      (["home", "draw", "away"] as const).forEach((sel, i) => {
        if (tw["1x2"][sel]) cands.push({ matchId, label, pick: SEL_ZH[sel], twOdds: tw["1x2"][sel], trueProb: probs[i], ev: probs[i] * tw["1x2"][sel] - 1, kickoff: mm.kickoff });
      });
    }
    // 大小球 2.5
    if (tw.total?.over && tw.total?.under && pin.total?.over && pin.total?.under) {
      const probs = removeMargin([pin.total.over, pin.total.under]);
      (["over", "under"] as const).forEach((sel, i) => {
        if (tw.total[sel]) cands.push({ matchId, label, pick: SEL_ZH[sel], twOdds: tw.total[sel], trueProb: probs[i], ev: probs[i] * tw.total[sel] - 1, kickoff: mm.kickoff });
      });
    }
    // 每場取 EV 最高的一注（且 ≥ 門檻）
    const best = cands.filter((c) => c.ev >= minEv).sort((a, b) => b.ev - a.ev)[0];
    if (best) legs.push(best);
  }
  return legs.sort((a, b) => b.ev - a.ev);
}

/** 從 +EV 單注組出 2 串與 3 串建議，依合併 EV 排序 */
export async function buildParlays(env: Env): Promise<any> {
  const legs = await bestLegs(env, 0); // 只用正 EV 單注
  const fmt = (combo: Leg[]) => {
    const odds = combo.reduce((a, l) => a * l.twOdds, 1);
    const prob = combo.reduce((a, l) => a * l.trueProb, 1);
    return {
      legs: combo.map((l) => ({ match: l.label, pick: l.pick, odds: +l.twOdds.toFixed(2), ev: +(l.ev * 100).toFixed(1) })),
      combinedOdds: +odds.toFixed(2),
      hitProb: +(prob * 100).toFixed(1),
      combinedEv: +((prob * odds - 1) * 100).toFixed(1),
    };
  };

  const top = legs.slice(0, 6); // 取 EV 最高的幾注組合
  const out: any[] = [];
  for (let i = 0; i < top.length; i++)
    for (let j = i + 1; j < top.length; j++) {
      if (top[i].matchId === top[j].matchId) continue;
      out.push({ type: "2串1", ...fmt([top[i], top[j]]) });
      for (let k = j + 1; k < top.length; k++) {
        if (top[k].matchId === top[i].matchId || top[k].matchId === top[j].matchId) continue;
        out.push({ type: "3串1", ...fmt([top[i], top[j], top[k]]) });
      }
    }
  out.sort((a, b) => b.combinedEv - a.combinedEv);
  return {
    valueLegs: legs.map((l) => ({ match: l.label, pick: l.pick, odds: +l.twOdds.toFixed(2), ev: +(l.ev * 100).toFixed(1) })),
    parlays: out.slice(0, 8),
  };
}
