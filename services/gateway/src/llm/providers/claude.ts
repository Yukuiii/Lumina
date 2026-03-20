import { readSseLines, fetchWithTimeout } from "../streamLlm";
import type { LlmStreamOptions, LlmStreamResult } from "../types";

/**
 * Claude Messages API 流式调用。
 *
 * ```
 * POST {baseUrl}/messages
 * body: { model, system, messages, max_tokens, stream: true }
 * Auth: x-api-key: {apiKey}, anthropic-version: 2023-06-01
 *
 * 解析: event: content_block_delta → data: {"delta":{"type":"text_delta","text":"..."}}
 * 结束: event: message_stop
 * ```
 */
export async function streamClaude(options: LlmStreamOptions): Promise<LlmStreamResult> {
  const { config, userMessage, signal, onDelta } = options;

  const response = await fetchWithTimeout(
    `${config.baseUrl}/messages`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": config.apiKey,
        "anthropic-version": "2023-06-01"
      },
      body: JSON.stringify({
        model: config.model,
        system: config.systemPrompt,
        messages: [{ role: "user", content: userMessage }],
        max_tokens: config.maxTokens > 0 ? config.maxTokens : 1024,
        stream: true
      })
    },
    signal
  );

  const body = response.body;

  if (!body) {
    throw new Error("Claude API 响应无 body");
  }

  let fullText = "";

  for await (const event of readSseLines(body, signal)) {
    if (event.event === "message_stop") {
      break;
    }

    if (event.event === "content_block_delta") {
      try {
        const parsed = JSON.parse(event.data) as {
          delta?: { type?: string; text?: string };
        };

        if (parsed.delta?.type === "text_delta" && typeof parsed.delta.text === "string") {
          fullText += parsed.delta.text;
          onDelta(parsed.delta.text);
        }
      } catch {
        // 跳过无法解析的行。
      }
    }
  }

  return { fullText };
}
