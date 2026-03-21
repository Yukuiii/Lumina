import type { AsrAdapter, AsrAdapterFactory, AsrCallbacks, AsrConfig } from "./types";
import { createWebSpeechAdapter } from "./providers/webSpeechApi";

/** provider → 工厂函数映射表，新增 provider 只需追加一行。 */
const PROVIDER_FACTORY: Record<string, AsrAdapterFactory> = {
  "web-speech-api": createWebSpeechAdapter
};

/**
 * ASR 适配器统一入口——根据 config.provider 分派到对应工厂。
 */
export function createAsrAdapter(config: AsrConfig, callbacks: AsrCallbacks): AsrAdapter {
  const factory = PROVIDER_FACTORY[config.provider];

  if (!factory) {
    throw new Error(`不支持的 ASR provider: ${config.provider}`);
  }

  return factory(config, callbacks);
}
