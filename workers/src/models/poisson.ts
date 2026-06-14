/**
 * Poisson 進球模型
 * - 由兩隊期望進球 (xG) 算比分機率矩陣
 * - 推導 主勝/平/客勝、各比分機率、大小球、雙方進球
 */

const factorial = (n: number): number => (n <= 1 ? 1 : n * factorial(n - 1));

/** Poisson 機率質量：進 k 球、期望 lambda */
const pmf = (k: number, lambda: number): number =>
  (lambda ** k * Math.exp(-lambda)) / factorial(k);

export interface PoissonResult {
  probHome: number;
  probDraw: number;
  probAway: number;
  topScores: { score: string; prob: number }[];
  over25: number;
  over35: number;
  btts: number; // both teams to score
  xgHome: number;
  xgAway: number;
}

export function poisson(xgHome: number, xgAway: number, maxGoals = 8): PoissonResult {
  let pHome = 0, pDraw = 0, pAway = 0, over25 = 0, over35 = 0, btts = 0;
  const scores: { score: string; prob: number }[] = [];

  for (let h = 0; h <= maxGoals; h++) {
    for (let a = 0; a <= maxGoals; a++) {
      const p = pmf(h, xgHome) * pmf(a, xgAway);
      if (h > a) pHome += p;
      else if (h === a) pDraw += p;
      else pAway += p;
      if (h + a > 2.5) over25 += p;
      if (h + a > 3.5) over35 += p;
      if (h >= 1 && a >= 1) btts += p;
      scores.push({ score: `${h}-${a}`, prob: p });
    }
  }

  const topScores = scores.sort((x, y) => y.prob - x.prob).slice(0, 4)
    .map((s) => ({ score: s.score, prob: +(s.prob).toFixed(4) }));

  return {
    probHome: +pHome.toFixed(4), probDraw: +pDraw.toFixed(4), probAway: +pAway.toFixed(4),
    topScores, over25: +over25.toFixed(4), over35: +over35.toFixed(4), btts: +btts.toFixed(4),
    xgHome, xgAway,
  };
}

/**
 * 由 Elo 差推估 xG：實力越強期望進球越高，含主場加成。
 * 基準聯賽平均每隊每場 ~1.35 球。
 */
export function eloToXg(eloHome: number, eloAway: number): { xgHome: number; xgAway: number } {
  const base = 1.35;
  const diff = (eloHome + 60 - eloAway) / 400; // 主場 +60
  return {
    xgHome: +(base * 10 ** (diff * 0.25)).toFixed(3),
    xgAway: +(base * 10 ** (-diff * 0.25)).toFixed(3),
  };
}
