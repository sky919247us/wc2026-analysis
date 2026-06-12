import type { LLMProvider, LLMRequest, LLMResponse } from "./provider";

/**
 * OpenAI 及所有 OpenAI 相容端點（DeepSeek、Groq、Together、自架 Ollama…）。
 * 換端點只需改 baseUrl，不動其他程式。
 */
export class OpenAIProvider implements LLMProvider {
  readonly name = "openai";
  constructor(
    private apiKey: string,
    readonly model: string = "gpt-4o-mini",
    private baseUrl: string = "https://api.openai.com/v1",
  ) {}

  async generate(req: LLMRequest): Promise<LLMResponse> {
    const res = await fetch(`${this.baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model: this.model,
        max_tokens: req.maxTokens ?? 1500,
        temperature: req.temperature ?? 0.7,
        messages: [
          ...(req.system ? [{ role: "system", content: req.system }] : []),
          { role: "user", content: req.prompt },
        ],
      }),
      signal: AbortSignal.timeout(60_000),
    });
    if (!res.ok) throw new Error(`openai ${res.status}: ${await res.text()}`);
    const data = (await res.json()) as any;
    return {
      text: data.choices?.[0]?.message?.content ?? "",
      provider: this.name,
      model: this.model,
      inputTokens: data.usage?.prompt_tokens,
      outputTokens: data.usage?.completion_tokens,
    };
  }
}
