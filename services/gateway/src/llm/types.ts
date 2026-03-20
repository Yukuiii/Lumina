/**
 * 支持的 LLM 提供商。
 */
export type LlmProvider = "openai" | "openai-responses" | "claude" | "gemini";

/**
 * LLM 运行时配置。
 */
export type LlmConfig = {
  provider: LlmProvider;
  apiKey: string;
  baseUrl: string;
  model: string;
  systemPrompt: string;
  /** 最大输出 token 数。为 0 时使用 provider 默认值。 */
  maxTokens: number;
};

/**
 * 流式调用参数。
 *
 * `requestId` 不在此接口中——它属于 Gateway 层的职责，
 * 由 server.ts 在 text.user 处理分支中透传到 llm.delta/llm.final payload。
 */
export type LlmStreamOptions = {
  config: LlmConfig;
  userMessage: string;
  signal: AbortSignal;
  onDelta: (delta: string) => void;
};

/**
 * 流式调用结果。
 */
export type LlmStreamResult = {
  /** 完整的回复文本（用于 llm.final.payload.text）。 */
  fullText: string;
};

/**
 * 单个 provider 的流式实现签名。
 */
export type LlmStreamFunction = (options: LlmStreamOptions) => Promise<LlmStreamResult>;
