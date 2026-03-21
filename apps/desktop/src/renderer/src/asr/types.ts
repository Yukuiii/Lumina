// ─── ASR 适配器抽象层 ─────────────────────────────────────────────
// 参照 LLM 适配器模式（Factory + Strategy），为语音识别提供可扩展接口。

/** 支持的 ASR 提供商。 */
export type AsrProvider = "web-speech-api";

/** ASR 运行时配置。 */
export type AsrConfig = {
  provider: AsrProvider;
  /** BCP-47 语言标签，如 "zh-CN"、"en-US"。 */
  lang: string;
};

/** ASR 会话的实时状态。 */
export type AsrStatus = "idle" | "listening" | "error";

/** ASR 识别结果事件。 */
export type AsrResultEvent = {
  /** 当前识别的文本。 */
  transcript: string;
  /** 是否为最终结果（false 表示中间结果，会被后续结果覆盖）。 */
  isFinal: boolean;
};

/** ASR 错误事件。 */
export type AsrErrorEvent = {
  code: string;
  message: string;
};

/** ASR 适配器回调集合。 */
export type AsrCallbacks = {
  onResult: (event: AsrResultEvent) => void;
  onError: (event: AsrErrorEvent) => void;
  onStatusChange: (status: AsrStatus) => void;
};

/**
 * ASR 适配器接口——每个 provider 实现此接口。
 *
 * 生命周期：create → start → (onResult* / onError) → stop → start → …
 * 适配器实例可反复 start/stop。
 */
export type AsrAdapter = {
  /** 开始识别。 */
  start: () => void;
  /** 停止识别。 */
  stop: () => void;
  /** 销毁适配器，释放资源。 */
  destroy: () => void;
};

/** 适配器工厂函数签名。 */
export type AsrAdapterFactory = (config: AsrConfig, callbacks: AsrCallbacks) => AsrAdapter;
