import type { LLMProvider, LLMRequest, LLMResponse } from "./provider";

/**
 * Google Gemini（generativelanguage REST API）。
 * 用戶以免費 Project（無付款方式）使用，作為白話報告的優先供應商。
 * 模型 id 由建構參數帶入（如 gemini-2.0-flash / gemini-2.5-flash）。
 */
export class GeminiProvider implements LLMProvider {
  readonly name = "gemini";
  constructor(
    private apiKey: string,
    readonly model: string = "gemini-2.0-flash",
  ) {}

  async generate(req: LLMRequest): Promise<LLMResponse> {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${this.model}:generateContent?key=${this.apiKey}`;
    const res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        ...(req.system ? { systemInstruction: { parts: [{ text: req.system }] } } : {}),
        contents: [{ role: "user", parts: [{ text: req.prompt }] }],
        generationConfig: {
          maxOutputTokens: req.maxTokens ?? 1500,
          temperature: req.temperature ?? 0.7,
        },
      }),
      signal: AbortSignal.timeout(60_000),
    });
    if (!res.ok) throw new Error(`gemini ${res.status}: ${await res.text()}`);
    const data = (await res.json()) as any;
    const text = data.candidates?.[0]?.content?.parts?.map((p: any) => p.text).join("") ?? "";
    return {
      text,
      provider: this.name,
      model: this.model,
      inputTokens: data.usageMetadata?.promptTokenCount,
      outputTokens: data.usageMetadata?.candidatesTokenCount,
    };
  }
}
