import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import path from "node:path";
import { getLuminaSettingsFilePath } from "./settingsPath";

// ─── Canonical Types ──────────────────────────────────────────────

/** 持久化到 settings.json 的完整结构。 */
export type LuminaSettings = {
  llm: {
    provider: string;
    apiKey: string;
    model: string;
    baseUrl: string;
    systemPrompt: string;
    maxTokens: number;
  };
};

/** getSettings() 返回给 renderer 的脱敏版本。 */
export type LuminaSettingsPublic = {
  llm: {
    provider: string;
    hasApiKey: boolean;
    model: string;
    baseUrl: string;
    systemPrompt: string;
    maxTokens: number;
  };
};

/** saveSettings() 接收的 payload（apiKey 三值语义）。 */
export type LuminaSettingsSavePayload = {
  llm: {
    provider: string;
    apiKey?: string; // undefined=保留, ""=清空, "sk-xxx"=替换
    model: string;
    baseUrl: string;
    systemPrompt: string;
    maxTokens: number;
  };
};

// ─── 有效值常量 ──────────────────────────────────────────────────

const VALID_PROVIDERS = new Set(["openai", "openai-responses", "claude", "gemini"]);

// ─── 默认值 ──────────────────────────────────────────────────────

function createDefaultSettings(): LuminaSettings {
  return {
    llm: {
      provider: "",
      apiKey: "",
      model: "",
      baseUrl: "",
      systemPrompt: "",
      maxTokens: 0
    }
  };
}

// ─── 读取 ────────────────────────────────────────────────────────

/**
 * 从 settings.json 读取完整配置。
 *
 * 文件不存在或解析失败时返回默认空结构。
 */
export function readSettings(): LuminaSettings {
  const filePath = getLuminaSettingsFilePath();

  if (!existsSync(filePath)) {
    return createDefaultSettings();
  }

  try {
    const raw = readFileSync(filePath, "utf8");
    const parsed = JSON.parse(raw) as Partial<LuminaSettings>;
    const defaults = createDefaultSettings();

    return {
      llm: {
        provider: typeof parsed.llm?.provider === "string" ? parsed.llm.provider : defaults.llm.provider,
        apiKey: typeof parsed.llm?.apiKey === "string" ? parsed.llm.apiKey : defaults.llm.apiKey,
        model: typeof parsed.llm?.model === "string" ? parsed.llm.model : defaults.llm.model,
        baseUrl: typeof parsed.llm?.baseUrl === "string" ? parsed.llm.baseUrl : defaults.llm.baseUrl,
        systemPrompt:
          typeof parsed.llm?.systemPrompt === "string" ? parsed.llm.systemPrompt : defaults.llm.systemPrompt,
        maxTokens: typeof parsed.llm?.maxTokens === "number" ? parsed.llm.maxTokens : defaults.llm.maxTokens
      }
    };
  } catch {
    return createDefaultSettings();
  }
}

// ─── 脱敏 ────────────────────────────────────────────────────────

/** 将完整配置脱敏为 renderer 安全版本。 */
export function toPublicSettings(settings: LuminaSettings): LuminaSettingsPublic {
  return {
    llm: {
      provider: settings.llm.provider,
      hasApiKey: settings.llm.apiKey.length > 0,
      model: settings.llm.model,
      baseUrl: settings.llm.baseUrl,
      systemPrompt: settings.llm.systemPrompt,
      maxTokens: settings.llm.maxTokens
    }
  };
}

// ─── 写入 ────────────────────────────────────────────────────────

/**
 * 三步保存：merge → validate → atomic write。
 */
export function writeSettings(payload: LuminaSettingsSavePayload): { ok: boolean; error?: string } {
  // 1. 读旧值
  const old = readSettings();

  // 2. merge（apiKey 三值语义 + 空白归一化）
  const merged: LuminaSettings = {
    llm: {
      provider: payload.llm.provider,
      apiKey:
        payload.llm.apiKey === undefined
          ? old.llm.apiKey // 保留旧值
          : payload.llm.apiKey, // "" = 清空，非空 = 替换
      model: payload.llm.model.trim(),
      baseUrl: payload.llm.baseUrl.trim(),
      systemPrompt: payload.llm.systemPrompt.trim(),
      maxTokens: payload.llm.maxTokens
    }
  };

  // 3. validate（校验合并后的最终态）
  const error = validateSettings(merged);

  if (error) {
    return { ok: false, error };
  }

  // 4. atomic write
  try {
    const filePath = getLuminaSettingsFilePath();
    const dir = path.dirname(filePath);

    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }

    const tmpPath = `${filePath}.tmp`;
    writeFileSync(tmpPath, JSON.stringify(merged, null, 2), "utf8");
    renameSync(tmpPath, filePath);

    return { ok: true };
  } catch (err) {
    return {
      ok: false,
      error: `写入失败：${err instanceof Error ? err.message : String(err)}`
    };
  }
}

// ─── 校验 ────────────────────────────────────────────────────────

function validateSettings(settings: LuminaSettings): string | null {
  const { provider, apiKey, maxTokens } = settings.llm;

  if (!provider) {
    return "请选择 LLM 提供商";
  }

  if (!VALID_PROVIDERS.has(provider)) {
    return `无效的 LLM 提供商：${provider}`;
  }

  if (!apiKey || !apiKey.trim()) {
    return "API Key 不能为空";
  }

  if (!Number.isInteger(maxTokens) || maxTokens < 0) {
    return "Max Tokens 必须为非负整数";
  }

  return null;
}
