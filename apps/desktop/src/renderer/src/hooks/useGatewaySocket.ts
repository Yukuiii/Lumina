import { useCallback, useRef, useState } from "react";
import {
  createEnvelope,
  safeParseWsEnvelope,
  WS_EVENT_TYPE
} from "@lumina/protocol";
import { useWebSocketTransport } from "./useWebSocketTransport";

/**
 * WebSocket 连接状态（re-export 传输层类型以保持消费者 API 不变）。
 */
export type { TransportStatus as ConnectionStatus } from "./useWebSocketTransport";

const GATEWAY_WS_URL = "ws://127.0.0.1:8787/ws";

/**
 * `useGatewaySocket` 的返回值。
 */
export type GatewaySocketState = {
  /** 当前连接状态。 */
  status: "connecting" | "connected" | "disconnected" | "failed";
  /** `llm.delta` 逐帧追加的累积文本，是气泡的唯一文本来源。 */
  streamingText: string;
  /** 最近一次服务端错误文本（用于 UI 展示）。 */
  errorText: string;
  /** 是否正在接收 `llm.delta` 流。 */
  isStreaming: boolean;
  /** 发送文本消息（仅 `connected` 时有效）。 */
  sendTextMessage: (text: string) => void;
  /** 重连耗尽后的显式重试入口。 */
  retry: () => void;
};

/**
 * 管理渲染进程到 Gateway 的协议层与领域层。
 *
 * 协议职责：
 * - `sessionId` 和 `seqOut` 作为一等公民
 * - 使用 `@lumina/protocol` 的 `createEnvelope()` / `safeParseWsEnvelope()`
 * - 连接建立后发送 `session.start`
 *
 * 领域职责：
 * - 流式文本聚合（`llm.delta` → `streamingText`）
 * - 发新消息时主动清空旧流（被打断的流不会收到 `llm.final`）
 * - 断线时同步清空流式状态
 *
 * 传输层（连接、重连、退避、retry）委托给 `useWebSocketTransport`。
 */
export function useGatewaySocket(): GatewaySocketState {
  const [streamingText, setStreamingText] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [errorText, setErrorText] = useState("");

  // 协议状态：sessionId 整个组件生命周期内不变，seqOut 全局单调递增不因重连重置。
  const sessionIdRef = useRef(crypto.randomUUID());
  const seqOutRef = useRef(0);

  // 请求关联：每次 sendTextMessage 生成唯一 requestId，
  // 只接受 requestId 匹配的 llm.delta/llm.final，防止跨请求 stale delta 污染。
  const activeRequestIdRef = useRef<string | null>(null);

  /**
   * 清空本地流式状态（断线 / 发新消息时调用）。
   */
  const clearStreamingState = useCallback(() => {
    setStreamingText("");
    setIsStreaming(false);
    setErrorText("");
    activeRequestIdRef.current = null;
  }, []);

  /**
   * 连接建立后发送 session.start 包络。
   */
  const handleOpen = useCallback((ws: WebSocket) => {
    const envelope = createEnvelope({
      type: WS_EVENT_TYPE.SessionStart,
      sessionId: sessionIdRef.current,
      seq: ++seqOutRef.current,
      payload: {}
    });

    ws.send(JSON.stringify(envelope));
  }, []);

  /**
   * 处理下行消息：解析包络，分派到对应的领域逻辑。
   */
  const handleMessage = useCallback((data: string) => {
    const parsed = safeParseWsEnvelope(data);

    if (!parsed.ok) {
      console.error("[GatewaySocket] 消息解析失败:", parsed.error);
      return;
    }

    const { type, payload } = parsed.value;

    switch (type) {
      case WS_EVENT_TYPE.LlmDelta: {
        const deltaPayload = payload as { textDelta?: unknown; requestId?: unknown };
        const delta = deltaPayload.textDelta;

        // 只接受 requestId 匹配当前活跃请求的 delta，丢弃 stale 分片。
        if (
          typeof deltaPayload.requestId === "string" &&
          deltaPayload.requestId !== activeRequestIdRef.current
        ) {
          break;
        }

        if (typeof delta === "string") {
          setIsStreaming(true);
          setStreamingText((prev) => prev + delta);
        }
        break;
      }
      case WS_EVENT_TYPE.LlmFinal: {
        const finalPayload = payload as { requestId?: unknown };

        // 同样按 requestId 过滤，避免旧请求的 final 信号误关流式状态。
        if (
          typeof finalPayload.requestId === "string" &&
          finalPayload.requestId !== activeRequestIdRef.current
        ) {
          break;
        }

        // llm.final 仅作为完成信号，不覆盖气泡文本。
        setIsStreaming(false);
        break;
      }
      case WS_EVENT_TYPE.Error: {
        const errorPayload = payload as { code?: string; message?: string; detail?: { message?: string } };
        const msg = errorPayload.detail?.message || errorPayload.message || "未知错误";
        console.error("[GatewaySocket] 服务端错误:", errorPayload.code, msg);
        setErrorText(`${msg}`);
        setIsStreaming(false);
        break;
      }
      default:
        break;
    }
  }, []);

  const { status, send, retry } = useWebSocketTransport({
    url: GATEWAY_WS_URL,
    onOpen: handleOpen,
    onMessage: handleMessage,
    onDisconnect: clearStreamingState
  });

  /**
   * 发送 `text.user` 消息。仅 `connected` 时有效。
   */
  const sendTextMessage = useCallback(
    (text: string) => {
      const requestId = crypto.randomUUID();

      const envelope = createEnvelope({
        type: WS_EVENT_TYPE.TextUser,
        sessionId: sessionIdRef.current,
        seq: ++seqOutRef.current,
        payload: { text, requestId }
      });

      const sent = send(JSON.stringify(envelope));

      // 仅在消息确认发出后才清空旧流并激活新的 requestId。
      if (sent) {
        clearStreamingState();
        activeRequestIdRef.current = requestId;
      }
    },
    [clearStreamingState, send]
  );

  return {
    status,
    streamingText,
    errorText,
    isStreaming,
    sendTextMessage,
    retry
  };
}
