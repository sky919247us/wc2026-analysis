/**
 * 五模型融合預測（對應原站「五模型」賣點，但市場信號改用去水機率）
 *   1. Elo 實力模型
 *   2. Poisson 進球模型
 *   3. 特徵加權模型（近況/傷停/休息，目前用 Elo 近似，資料補齊後加權）
 *   4. 市場信號（Pinnacle 去水機率；無賠率時跳過）
 *   5. 融合 = 上述加權平均
 * 輸出信心指數、爆冷指數、風險評級。
 */
import { expectedScore } from "./elo";
import { poisson, eloToXg, type PoissonResult } from "./poisson";
import { removeMargin } from "./ev";

export interface FusionInput {
  eloHome: number;
  eloAway: number;
  marketOdds?: { home: number; draw: number; away: number }; // Pinnacle 1x2
}

export interface ModelProb { home: number; draw: number; away: number }

export interface FusionResult {
  elo: ModelProb;
  poisson: ModelProb;
  feature: ModelProb;
  market: ModelProb | null;
  fused: ModelProb;
  poissonDetail: PoissonResult;
  confidence: number; // 0-100
  upsetIndex: number; // 0-100
  riskGrade: "A" | "B" | "C";
}

/** Elo 期望勝率 → 含平局的三路機率（平局比例隨實力差縮放） */
function eloProbs(eloHome: number, eloAway: number): ModelProb {
  const eHome = expectedScore(eloHome, eloAway, true);
  const drawBase = 0.27 * (1 - Math.abs(eHome - 0.5)); // 勢均力敵平局率高
  const home = eHome * (1 - drawBase);
  const away = (1 - eHome) * (1 - drawBase);
  return norm({ home, draw: drawBase, away });
}

const norm = (p: ModelProb): ModelProb => {
  const s = p.home + p.draw + p.away;
  return { home: p.home / s, draw: p.draw / s, away: p.away / s };
};

export function fuse(input: FusionInput): FusionResult {
  const { eloHome, eloAway, marketOdds } = input;

  const elo = eloProbs(eloHome, eloAway);

  const xg = eloToXg(eloHome, eloAway);
  const pd = poisson(xg.xgHome, xg.xgAway);
  const poissonP: ModelProb = norm({ home: pd.probHome, draw: pd.probDraw, away: pd.probAway });

  // 特徵模型：目前以 Elo 為基底（傷停/近況資料齊全後在此調整）
  const feature = elo;

  const market = marketOdds
    ? (() => { const [h, d, a] = removeMargin([marketOdds.home, marketOdds.draw, marketOdds.away]);
        return { home: h, draw: d, away: a }; })()
    : null;

  // 加權融合：有市場時市場權重最高（最接近真實），否則統計模型均分
  const weights = market
    ? { elo: 0.2, poisson: 0.2, feature: 0.15, market: 0.45 }
    : { elo: 0.4, poisson: 0.35, feature: 0.25, market: 0 };

  const fused = norm({
    home: elo.home * weights.elo + poissonP.home * weights.poisson + feature.home * weights.feature + (market?.home ?? 0) * weights.market,
    draw: elo.draw * weights.elo + poissonP.draw * weights.poisson + feature.draw * weights.feature + (market?.draw ?? 0) * weights.market,
    away: elo.away * weights.elo + poissonP.away * weights.poisson + feature.away * weights.feature + (market?.away ?? 0) * weights.market,
  });

  // 信心指數：最大機率越高、模型越一致 → 越有信心
  const maxP = Math.max(fused.home, fused.draw, fused.away);
  const spread = stdev([elo, poissonP, ...(market ? [market] : [])].map((m) => favorite(m)));
  const confidence = Math.round(clamp(maxP * 100 + (1 - spread) * 20 - 15, 5, 99));

  // 爆冷指數：非熱門方的合計機率
  const fav = maxP === fused.home ? "home" : maxP === fused.away ? "away" : "draw";
  const upsetIndex = Math.round((1 - fused[fav]) * 100);

  const riskGrade: "A" | "B" | "C" = confidence >= 70 ? "A" : confidence >= 50 ? "B" : "C";

  return {
    elo: round(elo), poisson: round(poissonP), feature: round(feature),
    market: market ? round(market) : null, fused: round(fused),
    poissonDetail: pd, confidence, upsetIndex, riskGrade,
  };
}

const favorite = (m: ModelProb): number => Math.max(m.home, m.draw, m.away);
const clamp = (x: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, x));
const stdev = (xs: number[]): number => {
  if (xs.length < 2) return 0;
  const mean = xs.reduce((a, b) => a + b, 0) / xs.length;
  return Math.sqrt(xs.reduce((s, x) => s + (x - mean) ** 2, 0) / xs.length);
};
const round = (p: ModelProb): ModelProb => ({
  home: +p.home.toFixed(4), draw: +p.draw.toFixed(4), away: +p.away.toFixed(4),
});
