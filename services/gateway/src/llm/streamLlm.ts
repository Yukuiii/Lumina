import type { LlmStreamFunction, LlmStreamOptions, LlmStreamResult } from "./types";
import { streamOpenAi } from "./providers/openai";
import { streamOpenAiResponses } from "./providers/openaiResponses";
import { streamClaude } from "./providers/claude";
import { streamGemini } from "./providers/gemini";

/**
 * Provider → 流式实现的映射。
 */
const PROVIDER_STREAM_FN: Record<string, LlmStreamFunction> = {
  openai: streamOpenAi,
  "openai-responses": streamOpenAiResponses,
  claude: streamClaude,
  gemini: streamGemini
};

/**
 * 统一入口：按 config.provider 分派到对应的流式实现。
 */
export async function streamLlm(options: LlmStreamOptions): Promise<LlmStreamResult> {
  const fn = PROVIDER_STREAM_FN[options.config.provider];

  if (!fn) {
    throw new Error(`不支持的 LLM provider: ${options.config.provider}`);
  }

  return fn(options);
}

// ─── 共享 SSE 工具 ───────────────────────────────────────────────

/**
 * 已解析的 SSE 事件。
 */
export type SseEvent = {
  /** SSE event 字段（可选）。 */
  event?: string;
  /** SSE data 字段（已拼接多行 data）。 */
  data: string;
};

/**
 * 从 fetch Response 的 ReadableStream 中逐行读取 SSE 事件。
 *
 * 共享给所有 provider：
 * - `TextDecoder` 解码 → 按 `\n` 分行
 * - 累积 `event:` 和 `data:` 字段
 * - 遇到空行时 yield 一条完整事件
 * - `signal.aborted` 时安全退出
 */
export async function* readSseLines(
  body: ReadableStream<Uint8Array>,
  signal: AbortSignal
): AsyncGenerator<SseEvent> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let currentEvent: string | undefined;
  let dataLines: string[] = [];

  try {
    while (!signal.aborted) {
      const { done, value } = await reader.read();

      if (done) {
        break;
      }

      buffer += decoder.decode(value, { stream: true });

      const lines = buffer.split("\n");
      // 最后一个元素可能是不完整的行，留到下一轮。
      buffer = lines.pop() ?? "";

      for (const rawLine of lines) {
        if (signal.aborted) {
          return;
        }

        // 兼容 \r\n 行尾：标准 SSE 流可能使用 \r\n 而非纯 \n。
        const line = rawLine.replace(/\r$/, "");

        if (line.startsWith("event:")) {
          currentEvent = line.slice(6).trim();
        } else if (line.startsWith("data:")) {
          dataLines.push(line.slice(5).trimStart());
        } else if (line === "") {
          // 空行 = 事件边界。
          if (dataLines.length > 0) {
            yield {
              event: currentEvent,
              data: dataLines.join("\n")
            };
            currentEvent = undefined;
            dataLines = [];
          }
        }
        // 忽略 `:` 开头的注释行和其他字段。
      }
    }

    // 流结束后，buffer 中可能还残留最后一行未被 \n 切出。
    // 先把它当作最后一行解析，再 flush 残留的 dataLines。
    if (buffer.length > 0 && !signal.aborted) {
      const lastLine = buffer.replace(/\r$/, "");

      if (lastLine.startsWith("event:")) {
        currentEvent = lastLine.slice(6).trim();
      } else if (lastLine.startsWith("data:")) {
        dataLines.push(lastLine.slice(5).trimStart());
      }
      // 空行或注释行不需要特殊处理。
    }

    // flush 残留的最后一个事件（流正常结束但没有尾部空行）。
    if (dataLines.length > 0 && !signal.aborted) {
      yield {
        event: currentEvent,
        data: dataLines.join("\n")
      };
    }
  } finally {
    reader.releaseLock();
  }
}

/**
 * 发起带超时的 fetch 请求。
 *
 * 将用户中断 signal 与 30s 超时 signal 合并。
 */
export async function fetchWithTimeout(
  url: string,
  init: RequestInit,
  signal: AbortSignal
): Promise<Response> {
  const timeoutController = new AbortController();
  const timeoutId = setTimeout(() => timeoutController.abort(), 30_000);

  // 用户中断时同步取消超时。
  const onAbort = (): void => timeoutController.abort();
  signal.addEventListener("abort", onAbort, { once: true });

  try {
    console.log(`[LLM] ${init.method ?? "GET"} ${url}`);
    const response = await fetch(url, {
      ...init,
      signal: timeoutController.signal
    });

    if (!response.ok) {
      const errorBody = await response.text().catch(() => "");
      throw new Error(`LLM API 错误 ${response.status}: ${errorBody}`);
    }

    return response;
  } finally {
    clearTimeout(timeoutId);
    signal.removeEventListener("abort", onAbort);
  }
}
