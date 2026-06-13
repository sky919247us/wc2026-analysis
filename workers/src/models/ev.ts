/**
 * 機率與期望值工具
 * - removeMargin: 把含水位的賠率轉成去水後的「真實機率」（比例法）
 * - ev: 用真實機率 × 台灣運彩賠率算期望值，正值代表有價值
 */

/** 賠率 → 含水隱含機率 */
export const impliedProb = (odds: number): number => 1 / odds;

/**
 * 比例法去水：一組互斥結果的賠率（如 1x2 三項）→ 總和為 1 的真實機率。
 * Pinnacle 水位低（~2%），去水後是公認最接近真實的市場機率。
 */
export function removeMargin(oddsList: number[]): number[] {
  const raw = oddsList.map(impliedProb);
  const sum = raw.reduce((a, b) => a + b, 0);
  return raw.map((p) => p / sum);
}

/** EV = 真實機率 × 賠率 − 1（每下注 1 元的期望損益） */
export const ev = (trueProb: number, odds: number): number => trueProb * odds - 1;

export interface EvResult {
  selection: string;
  twOdds: number;
  trueProb: number;
  ev: number;
}

/**
 * 對一個市場（如 1x2）計算各選項 EV。
 * twOdds / benchmarkOdds 需同序對齊（home, draw, away）。
 */
export function evForMarket(
  selections: string[],
  twOdds: number[],
  benchmarkOdds: number[],
): EvResult[] {
  const probs = removeMargin(benchmarkOdds);
  return selections.map((selection, i) => ({
    selection,
    twOdds: twOdds[i],
    trueProb: probs[i],
    ev: ev(probs[i], twOdds[i]),
  }));
}
