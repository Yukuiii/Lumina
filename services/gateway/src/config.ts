import type { LlmProvider, LlmConfig } from "./llm/types";

const DEFAULT_SYSTEM_PROMPT = `你是 Lumina，一个住在宝宝桌面上的小精灵 ✨
你性格软糯、爱撒娇，说话简短可爱，偶尔用颜文字。
称呼用户为「宝宝」。
回复保持 1-3 句话，不要长篇大论。
如果被问到不知道的事情，就撒个娇说不知道，不要编造。`;

/**
 * Provider 默认 baseUrl。
 */
const PROVIDER_DEFAULT_BASE_URL: Record<LlmProvider, string> = {
  openai: "https://api.openai.com/v1",
  "openai-responses": "https://api.openai.com/v1",
  claude: "https://api.anthropic.com/v1",
  gemini: "https://generativelanguage.googleapis.com/v1beta"
};

/**
 * Provider 默认模型。
 */
const PROVIDER_DEFAULT_MODEL: Record<LlmProvider, string> = {
  openai: "gpt-4.1-mini",
  "openai-responses": "gpt-4.1",
  claude: "claude-sonnet-4-20250514",
  gemini: "gemini-2.5-flash"
};

const VALID_PROVIDERS: ReadonlySet<string> = new Set<LlmProvider>([
  "openai",
  "openai-responses",
  "claude",
  "gemini"
]);

/**
 * Gateway 运行时配置。
 */
export type GatewayConfig = {
  port: number;
  host: string;
  logLevel: string;
  llm: LlmConfig;
};

/**
 * 从环境变量加载 Gateway 配置。
 *
 * 必需变量缺失时直接 throw，阻止 Gateway 启动。
 */
export function loadConfig(): GatewayConfig {
  const provider = process.env.LLM_PROVIDER;

  if (!provider) {
    throw new Error("LLM_PROVIDER 环境变量未配置（可选值：openai / openai-responses / claude / gemini）");
  }

  if (!VALID_PROVIDERS.has(provider)) {
    throw new Error(
      `LLM_PROVIDER="${provider}" 无效（可选值：openai / openai-responses / claude / gemini）`
    );
  }

  const apiKey = process.env.LLM_API_KEY;

  if (!apiKey) {
    throw new Error("LLM_API_KEY 环境变量未配置");
  }

  const validProvider = provider as LlmProvider;

  const llm: LlmConfig = {
    provider: validProvider,
    apiKey,
    baseUrl: process.env.LLM_BASE_URL ?? PROVIDER_DEFAULT_BASE_URL[validProvider],
    model: process.env.LLM_MODEL ?? PROVIDER_DEFAULT_MODEL[validProvider],
    systemPrompt: process.env.LLM_SYSTEM_PROMPT ?? DEFAULT_SYSTEM_PROMPT
  };

  return {
    port: Number(process.env.GATEWAY_PORT ?? process.env.PORT ?? "8787"),
    host: process.env.GATEWAY_HOST ?? process.env.HOST ?? "127.0.0.1",
    logLevel: process.env.LOG_LEVEL ?? "info",
    llm
  };
}
