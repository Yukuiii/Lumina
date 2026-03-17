import { z } from "zod";

/**
 * WebSocket 消息的统一包络结构。
 */
export interface WsEnvelope<TPayload = unknown> {
  /** 事件类型，例如 `asr.partial`。 */
  type: string;
  /** 会话 ID，用于在日志与多连接场景下追踪。 */
  sessionId: string;
  /** 单向递增序号，用于排错与统计。 */
  seq: number;
  /** 发送端时间戳（毫秒），用于端到端延迟测量。 */
  timestampMs: number;
  /** 事件载荷。 */
  payload: TPayload;
}

/**
 * v0 协议的事件类型常量集合。
 */
export const WS_EVENT_TYPE = {
  SessionStart: "session.start",
  AudioStart: "audio.start",
  AudioChunk: "audio.chunk",
  AudioEnd: "audio.end",
  ControlInterrupt: "control.interrupt",
  AsrPartial: "asr.partial",
  AsrFinal: "asr.final",
  VadStart: "vad.start",
  VadEnd: "vad.end",
  LlmDelta: "llm.delta",
  LlmFinal: "llm.final",
  TtsAudioChunk: "tts.audio.chunk",
  TtsAudioEnd: "tts.audio.end",
  Error: "error",
  /**
   * 仅用于开发期的文本输入事件（可选扩展）。
   */
  TextUser: "text.user"
} as const;

/**
 * 事件类型的字符串字面量联合类型。
 */
export type WsEventType = (typeof WS_EVENT_TYPE)[keyof typeof WS_EVENT_TYPE];

/**
 * WebSocket 包络的基础校验（不校验 payload 结构）。
 */
export const zWsEnvelope = z.object({
  type: z.string().min(1),
  sessionId: z.string().min(1),
  seq: z.number().int().nonnegative(),
  timestampMs: z.number().int().nonnegative(),
  payload: z.unknown()
});

/**
 * 安全解析 WebSocket JSON 文本为包络结构。
 */
export function safeParseWsEnvelope(text: string):
  | { ok: true; value: WsEnvelope }
  | { ok: false; error: string } {
  try {
    const parsed = JSON.parse(text) as unknown;
    const result = zWsEnvelope.safeParse(parsed);
    if (!result.success) {
      return { ok: false, error: result.error.message };
    }
    // 关键点：Zod v3 会把 `unknown` 字段在类型层面推断为可选，但运行时仍是必填字段；这里做一次类型收敛。
    return { ok: true, value: result.data as WsEnvelope };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { ok: false, error: message };
  }
}

/**
 * 创建一个带默认字段的包络消息。
 */
export function createEnvelope<TPayload>(params: {
  type: WsEventType | string;
  sessionId: string;
  seq: number;
  payload: TPayload;
  timestampMs?: number;
}): WsEnvelope<TPayload> {
  return {
    type: params.type,
    sessionId: params.sessionId,
    seq: params.seq,
    timestampMs: params.timestampMs ?? Date.now(),
    payload: params.payload
  };
}
