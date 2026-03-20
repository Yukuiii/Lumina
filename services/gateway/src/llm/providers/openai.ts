import { readSseLines, fetchWithTimeout } from "../streamLlm";
import type { LlmStreamOptions, LlmStreamResult } from "../types";

/**
 * OpenAI Chat Completions 流式调用。
 *
 * ```
 * POST {baseUrl}/chat/completions
 * body: { model, messages, stream: true }
 * Auth: Authorization: Bearer {apiKey}
 *
 * 解析: data: {"choices":[{"delta":{"content":"..."}}]}
 * 结束: data: [DONE]
 * ```
 */
export async function streamOpenAi(options: LlmStreamOptions): Promise<LlmStreamResult> {
  const { config, userMessage, signal, onDelta } = options;

  const response = await fetchWithTimeout(
    `${config.baseUrl}/chat/completions`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${config.apiKey}`
      },
      body: JSON.stringify({
        model: config.model,
        messages: [
          { role: "system", content: config.systemPrompt },
          { role: "user", content: userMessage }
        ],
        stream: true
      })
    },
    signal
  );

  const body = response.body;

  if (!body) {
    throw new Error("OpenAI 响应无 body");
  }

  let fullText = "";

  for await (const event of readSseLines(body, signal)) {
    if (event.data === "[DONE]") {
      break;
    }

    try {
      const parsed = JSON.parse(event.data) as {
        choices?: { delta?: { content?: string }; finish_reason?: string }[];
      };

      const content = parsed.choices?.[0]?.delta?.content;

      if (typeof content === "string" && content.length > 0) {
        fullText += content;
        onDelta(content);
      }
    } catch {
      // 跳过无法解析的行，不中断整条流。
    }
  }

  return { fullText };
}
