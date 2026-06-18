import { generateWithFallback, type LLMEnv, type LLMResponse } from "./provider";

/** 模型管線輸出 → 白話文報告所需的結構化輸入 */
export interface MatchAnalysisInput {
  matchId: string;
  home: string;
  away: string;
  kickoffLocal: string; // 台灣時間
  eloHome: number;
  eloAway: number;
  xgHome: number;
  xgAway: number;
  probHome: number; // 融合後機率 0-1
  probDraw: number;
  probAway: number;
  confidence: number; // 0-100
  upsetIndex: number; // 爆冷指數 0-100
  /** 台灣運彩玩法 + EV（主推） */
  twOdds: {
    market: string; // 不讓分主勝 / 主讓1.5 / 大2.5 …
    odds: number;
    ev: number; // 期望值，正值代表有價值
  }[];
  /** 國際盤對照（輔助） */
  intlNote?: string;
  injuryNews?: string[];
}

const SYSTEM = `你是台灣的足球分析師，用繁體中文寫給完全不懂足球數據的新手看的白話分析。
規則：
- 推薦下注方式一律以「台灣運彩」的玩法與賠率為準（不讓分/讓分/大小/正確比數），國際盤只作參考佐證。
- 解釋專有名詞時用生活化比喻（Elo 像段位積分、xG 像「理論上該進幾球」）。
- 明確標出最有價值（EV 最高）的運彩玩法，並說明為什麼。
- ⚠️ 絕對不要提到「水錢」「抽水」「水位」「扣水」等字眼；談價值時直接用「期望值（EV）」說明即可。
- 結尾必附：「以上分析僅供參考，不構成投注建議。未滿18歲不得購買運動彩券，請理性投注。」
- 全文 500 字內，分段加 emoji 小標。`;

export async function generateMatchReport(
  env: LLMEnv,
  input: MatchAnalysisInput,
): Promise<LLMResponse> {
  const prompt = [
    `比賽：${input.home} vs ${input.away}（台灣時間 ${input.kickoffLocal}）`,
    `Elo：${input.home} ${input.eloHome}、${input.away} ${input.eloAway}`,
    `xG：${input.home} ${input.xgHome}、${input.away} ${input.xgAway}`,
    `融合機率：主勝 ${(input.probHome * 100).toFixed(1)}%、平 ${(input.probDraw * 100).toFixed(1)}%、客勝 ${(input.probAway * 100).toFixed(1)}%`,
    `信心指數 ${input.confidence}/100、爆冷指數 ${input.upsetIndex}/100`,
    `台灣運彩玩法與期望值：`,
    ...input.twOdds.map(
      (o) => `- ${o.market}：賠率 ${o.odds}，EV ${(o.ev * 100).toFixed(1)}%`,
    ),
    input.intlNote ? `國際盤觀察：${input.intlNote}` : "",
    input.injuryNews?.length ? `傷停消息：${input.injuryNews.join("；")}` : "",
    `請依以上數據寫白話分析報告。`,
  ]
    .filter(Boolean)
    .join("\n");

  return generateWithFallback(env, { system: SYSTEM, prompt, maxTokens: 1200 });
}
