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

  // 协议状态：sessionId 整个组件生命周期内不变，seqOut 全局单调递增不因重连重置。
  const sessionIdRef = useRef(crypto.randomUUID());
  const seqOutRef = useRef(0);

  /**
   * 清空本地流式状态（断线 / 发新消息时调用）。
   */
  const clearStreamingState = useCallback(() => {
    setStreamingText("");
    setIsStreaming(false);
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
        const delta = (payload as { textDelta?: unknown })?.textDelta;

        if (typeof delta === "string") {
          setIsStreaming(true);
          setStreamingText((prev) => prev + delta);
        }
        break;
      }
      case WS_EVENT_TYPE.LlmFinal: {
        // llm.final 仅作为完成信号，不覆盖气泡文本。
        setIsStreaming(false);
        break;
      }
      case WS_EVENT_TYPE.Error: {
        const errorPayload = payload as { code?: string; message?: string };
        console.error("[GatewaySocket] 服务端错误:", errorPayload.code, errorPayload.message);
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
      // 发新消息前主动打断旧流（被打断的流不会收到 llm.final）。
      clearStreamingState();

      const envelope = createEnvelope({
        type: WS_EVENT_TYPE.TextUser,
        sessionId: sessionIdRef.current,
        seq: ++seqOutRef.current,
        payload: { text }
      });

      send(JSON.stringify(envelope));
    },
    [clearStreamingState, send]
  );

  return {
    status,
    streamingText,
    isStreaming,
    sendTextMessage,
    retry
  };
}
