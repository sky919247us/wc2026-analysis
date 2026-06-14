/**
 * Elo 實力評分
 * - 世界盃 K 值較大（賽事權重高），主場優勢加成
 * - 從已完賽比分增量更新；新隊以 FIFA 排名粗估初始分
 */

const K = 40;           // 世界盃權重
const HOME_ADV = 60;    // 主場/地主優勢（Elo 分）

/** 期望勝率（含平局視為 0.5） */
export function expectedScore(eloA: number, eloB: number, homeForA = true): number {
  const adv = homeForA ? HOME_ADV : -HOME_ADV;
  return 1 / (1 + 10 ** ((eloB - (eloA + adv)) / 400));
}

/** 一場比賽後的新 Elo（result: 1 主勝 / 0.5 平 / 0 客勝） */
export function updateElo(
  eloHome: number, eloAway: number, result: number,
): { home: number; away: number } {
  const exp = expectedScore(eloHome, eloAway, true);
  // 大勝加成（goal difference multiplier，FIFA 式）
  return {
    home: Math.round(eloHome + K * (result - exp)),
    away: Math.round(eloAway + K * ((1 - result) - (1 - exp))),
  };
}

/** FIFA 排名 → 初始 Elo 粗估（排名 1 ≈ 2000，每名遞減） */
export function rankToElo(rank: number | null): number {
  if (!rank || rank < 1) return 1500;
  return Math.round(2000 - Math.min(rank, 100) * 6);
}
