/**
 * LLM 多供應商抽象層
 *
 * 報告生成只依賴 LLMProvider 介面。供應商順序由環境變數 LLM_PROVIDERS 決定，
 * 例如 "openai:gpt-4o-mini,anthropic:claude-haiku-4-5"。
 * 前者失敗（額度用盡 / 5xx / 逾時）自動 fallback 到下一家。
 */

export interface LLMRequest {
  system?: string;
  prompt: string;
  maxTokens?: number;
  temperature?: number;
}

export interface LLMResponse {
  text: string;
  provider: string; // 實際完成請求的供應商，存入 D1 方便追蹤成本與品質
  model: string;
  inputTokens?: number;
  outputTokens?: number;
}

export interface LLMProvider {
  readonly name: string;
  readonly model: string;
  generate(req: LLMRequest): Promise<LLMResponse>;
}

/** Worker 環境變數（wrangler secret put 設定，不進 repo） */
export interface LLMEnv {
  LLM_PROVIDERS?: string; // "openai:gpt-4o-mini,anthropic:claude-haiku-4-5"
  OPENAI_API_KEY?: string;
  OPENAI_BASE_URL?: string; // 可換成任何 OpenAI 相容端點（DeepSeek/Groq/自架）
  ANTHROPIC_API_KEY?: string;
  GEMINI_API_KEY?: string;
}

import { OpenAIProvider } from "./openai";
import { AnthropicProvider } from "./anthropic";
import { GeminiProvider } from "./gemini";

export function buildProviderChain(env: LLMEnv): LLMProvider[] {
  const spec = env.LLM_PROVIDERS ?? "openai:gpt-4o-mini";
  const chain: LLMProvider[] = [];
  for (const entry of spec.split(",").map((s) => s.trim()).filter(Boolean)) {
    const [vendor, ...rest] = entry.split(":");
    const model = rest.join(":");
    switch (vendor) {
      case "openai":
        if (env.OPENAI_API_KEY)
          chain.push(new OpenAIProvider(env.OPENAI_API_KEY, model, env.OPENAI_BASE_URL));
        break;
      case "anthropic":
        if (env.ANTHROPIC_API_KEY)
          chain.push(new AnthropicProvider(env.ANTHROPIC_API_KEY, model));
        break;
      case "gemini":
        if (env.GEMINI_API_KEY)
          chain.push(new GeminiProvider(env.GEMINI_API_KEY, model || undefined));
        break;
    }
  }
  return chain;
}

/** 依序嘗試供應商，全部失敗才拋錯。 */
export async function generateWithFallback(
  env: LLMEnv,
  req: LLMRequest,
): Promise<LLMResponse> {
  const chain = buildProviderChain(env);
  if (chain.length === 0) throw new Error("No LLM provider configured");
  let lastErr: unknown;
  for (const p of chain) {
    try {
      return await p.generate(req);
    } catch (e) {
      lastErr = e;
      console.warn(`LLM provider ${p.name}(${p.model}) failed, trying next`, e);
    }
  }
  throw lastErr;
}
