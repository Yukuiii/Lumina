/// <reference types="vite/client" />

interface ImportMetaEnv {
  /**
   * 可选的默认 Live2D 模型 profile id。
   *
   * 该值只用于 renderer 启动时选择当前默认内置模型，
   * 未设置时回退到 profile 注册表中的默认项。
   */
  readonly VITE_LIVE2D_MODEL_ID?: string;
}

// ─── Settings Types（映射 main process 的 canonical types） ───────

/** getSettings() 返回给 renderer 的脱敏版本。 */
type LuminaSettingsPublic = {
  llm: {
    provider: string;
    hasApiKey: boolean;
    model: string;
    baseUrl: string;
    systemPrompt: string;
    maxTokens: number;
  };
};

/** saveSettings() 接收的 payload。 */
type LuminaSettingsSavePayload = {
  llm: {
    provider: string;
    apiKey?: string;
    model: string;
    baseUrl: string;
    systemPrompt: string;
    maxTokens: number;
  };
};

/**
 * preload 暴露到 window 的最小 API 声明。
 */
declare global {
  interface Window {
    lumina: {
      /** 获取 Electron/Chrome/Node 的版本信息。 */
      getVersions(): { electron: string; chrome: string; node: string };
      /** 获取指定 Live2D 模型文件的本地可读 URL。 */
      getLive2DModelUrl(relativePath: string): string;
      /** 获取 Cubism Core 运行时脚本的本地可读 URL。 */
      getLive2DCoreScriptUrl(): string;
      /** 根据指针移动量拖动当前桌宠窗口。 */
      dragWindowBy(deltaX: number, deltaY: number): void;
      /** 获取当前持久化的设置（API key 脱敏）。 */
      getSettings(): Promise<LuminaSettingsPublic>;
      /** 保存设置到本地文件。 */
      saveSettings(payload: LuminaSettingsSavePayload): Promise<{ ok: boolean; error?: string }>;
      /** 打开设置子窗口。 */
      openSettings(): Promise<void>;
    };
    Live2DCubismCore?: unknown;
  }
}

export {};
