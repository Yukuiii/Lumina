import { existsSync, readFileSync } from "node:fs";
import { getLuminaSettingsFilePath } from "./settingsPath";
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
 * settings.json 中 LLM 分组的结构。
 */
type SettingsLlm = {
  provider?: string;
  apiKey?: string;
  baseUrl?: string;
  model?: string;
  systemPrompt?: string;
  maxTokens?: number;
};

/**
 * settings.json 顶层结构。
 */
type SettingsFile = {
  llm?: SettingsLlm;
};

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
 * 尝试从 settings.json 读取配置。
 *
 * 文件不存在或解析失败时返回空对象。
 */
function loadSettingsFile(): SettingsFile {
  const filePath = getLuminaSettingsFilePath();

  if (!existsSync(filePath)) {
    return {};
  }

  try {
    const raw = readFileSync(filePath, "utf8");
    return JSON.parse(raw) as SettingsFile;
  } catch {
    return {};
  }
}

/**
 * 从 settings.json + 环境变量加载 Gateway 配置。
 *
 * 优先级：环境变量 > settings.json > 内置默认值。
 * 必需字段（provider, apiKey）缺失时 throw，阻止启动。
 */
export function loadConfig(): GatewayConfig {
  const settings = loadSettingsFile();
  const llmSettings = settings.llm ?? {};

  // provider: env > settings > undefined
  const provider = process.env.LLM_PROVIDER ?? llmSettings.provider;

  if (!provider) {
    throw new Error(
      "LLM 提供商未配置。请先在桌面端设置面板配置 LLM provider 和 API Key（Cmd+, 或系统托盘 → 设置），" +
      "或通过环境变量 LLM_PROVIDER 设置（可选值：openai / openai-responses / claude / gemini）"
    );
  }

  if (!VALID_PROVIDERS.has(provider)) {
    throw new Error(
      `LLM_PROVIDER="${provider}" 无效（可选值：openai / openai-responses / claude / gemini）`
    );
  }

  // apiKey: env > settings > undefined
  const apiKey = process.env.LLM_API_KEY ?? llmSettings.apiKey;

  if (!apiKey) {
    throw new Error(
      "API Key 未配置。请先在桌面端设置面板配置 API Key（Cmd+, 或系统托盘 → 设置），" +
      "或通过环境变量 LLM_API_KEY 设置"
    );
  }

  const validProvider = provider as LlmProvider;

  const llm: LlmConfig = {
    provider: validProvider,
    apiKey,
    baseUrl: process.env.LLM_BASE_URL ?? (llmSettings.baseUrl || PROVIDER_DEFAULT_BASE_URL[validProvider]),
    model: process.env.LLM_MODEL ?? (llmSettings.model || PROVIDER_DEFAULT_MODEL[validProvider]),
    systemPrompt: process.env.LLM_SYSTEM_PROMPT ?? (llmSettings.systemPrompt || DEFAULT_SYSTEM_PROMPT),
    maxTokens: Number(process.env.LLM_MAX_TOKENS ?? llmSettings.maxTokens ?? 0)
  };

  return {
    port: Number(process.env.GATEWAY_PORT ?? process.env.PORT ?? "8787"),
    host: process.env.GATEWAY_HOST ?? process.env.HOST ?? "127.0.0.1",
    logLevel: process.env.LOG_LEVEL ?? "info",
    llm
  };
}
