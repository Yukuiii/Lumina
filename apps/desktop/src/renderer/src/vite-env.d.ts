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
  asr: {
    provider: string;
    lang: string;
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
  asr?: {
    provider?: string;
    lang?: string;
  };
};

// ─── Web Speech API 类型声明 ──────────────────────────────────────

declare global {
  /** Web Speech API 识别结果。 */
  interface SpeechRecognitionAlternative {
    readonly transcript: string;
    readonly confidence: number;
  }

  /** Web Speech API 单条识别结果。 */
  interface SpeechRecognitionResult {
    readonly length: number;
    readonly isFinal: boolean;
    item(index: number): SpeechRecognitionAlternative;
    [index: number]: SpeechRecognitionAlternative;
  }

  /** Web Speech API 识别结果列表。 */
  interface SpeechRecognitionResultList {
    readonly length: number;
    item(index: number): SpeechRecognitionResult;
    [index: number]: SpeechRecognitionResult;
  }

  /** Web Speech API 识别事件。 */
  interface SpeechRecognitionEvent extends Event {
    readonly resultIndex: number;
    readonly results: SpeechRecognitionResultList;
  }

  /** Web Speech API 错误事件。 */
  interface SpeechRecognitionErrorEvent extends Event {
    readonly error: string;
    readonly message: string;
  }

  /** Web Speech API 识别器接口。 */
  interface SpeechRecognition extends EventTarget {
    lang: string;
    continuous: boolean;
    interimResults: boolean;
    maxAlternatives: number;
    onresult: ((event: SpeechRecognitionEvent) => void) | null;
    onerror: ((event: SpeechRecognitionErrorEvent) => void) | null;
    onend: (() => void) | null;
    onstart: (() => void) | null;
    start(): void;
    stop(): void;
    abort(): void;
  }

  /** Web Speech API 识别器构造函数。 */
  interface SpeechRecognitionConstructor {
    new (): SpeechRecognition;
  }

  // eslint-disable-next-line no-var
  var SpeechRecognition: SpeechRecognitionConstructor | undefined;
  // eslint-disable-next-line no-var
  var webkitSpeechRecognition: SpeechRecognitionConstructor | undefined;
}

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
      /** 请求 macOS 麦克风权限。 */
      requestMicPermission(): Promise<{ status: "granted" | "denied" }>;
    };
    Live2DCubismCore?: unknown;
  }
}

export {};
