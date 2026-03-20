import { readSseLines, fetchWithTimeout } from "../streamLlm";
import type { LlmStreamOptions, LlmStreamResult } from "../types";

/**
 * OpenAI Responses API 流式调用。
 *
 * ```
 * POST {baseUrl}/responses
 * body: { model, input, stream: true }
 * Auth: Authorization: Bearer {apiKey}
 *
 * 解析: event: response.output_text.delta → data: {"delta":"..."}
 * 结束: event: response.completed
 * ```
 */
export async function streamOpenAiResponses(options: LlmStreamOptions): Promise<LlmStreamResult> {
  const { config, userMessage, signal, onDelta } = options;

  const response = await fetchWithTimeout(
    `${config.baseUrl}/responses`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${config.apiKey}`
      },
      body: JSON.stringify({
        model: config.model,
        instructions: config.systemPrompt,
        input: userMessage,
        stream: true,
        ...(config.maxTokens > 0 ? { max_output_tokens: config.maxTokens } : {})
      })
    },
    signal
  );

  const body = response.body;

  if (!body) {
    throw new Error("OpenAI Responses API 响应无 body");
  }

  let fullText = "";

  for await (const event of readSseLines(body, signal)) {
    if (event.event === "response.completed") {
      break;
    }

    if (event.event === "response.output_text.delta") {
      try {
        const parsed = JSON.parse(event.data) as { delta?: string };

        if (typeof parsed.delta === "string" && parsed.delta.length > 0) {
          fullText += parsed.delta;
          onDelta(parsed.delta);
        }
      } catch {
        // 跳过无法解析的行。
      }
    }
  }

  return { fullText };
}
