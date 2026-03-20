import { readSseLines, fetchWithTimeout } from "../streamLlm";
import type { LlmStreamOptions, LlmStreamResult } from "../types";

/**
 * Gemini streamGenerateContent 流式调用。
 *
 * ```
 * POST {baseUrl}/models/{model}:streamGenerateContent?alt=sse
 * body: { contents, systemInstruction }
 * Auth: x-goog-api-key: {apiKey}
 *
 * 解析: data: {"candidates":[{"content":{"parts":[{"text":"..."}]}}]}
 * 结束: 流正常关闭
 * ```
 */
export async function streamGemini(options: LlmStreamOptions): Promise<LlmStreamResult> {
  const { config, userMessage, signal, onDelta } = options;

  const url = `${config.baseUrl}/models/${config.model}:streamGenerateContent?alt=sse`;

  const response = await fetchWithTimeout(
    url,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": config.apiKey
      },
      body: JSON.stringify({
        systemInstruction: {
          parts: [{ text: config.systemPrompt }]
        },
        contents: [
          {
            role: "user",
            parts: [{ text: userMessage }]
          }
        ]
      })
    },
    signal
  );

  const body = response.body;

  if (!body) {
    throw new Error("Gemini API 响应无 body");
  }

  let fullText = "";

  for await (const event of readSseLines(body, signal)) {
    try {
      const parsed = JSON.parse(event.data) as {
        candidates?: { content?: { parts?: { text?: string }[] } }[];
      };

      const text = parsed.candidates?.[0]?.content?.parts?.[0]?.text;

      if (typeof text === "string" && text.length > 0) {
        fullText += text;
        onDelta(text);
      }
    } catch {
      // 跳过无法解析的行。
    }
  }

  return { fullText };
}
