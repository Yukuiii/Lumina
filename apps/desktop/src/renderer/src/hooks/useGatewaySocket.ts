import { useCallback, useEffect, useRef, useState } from "react";
import {
  createEnvelope,
  safeParseWsEnvelope,
  WS_EVENT_TYPE
} from "@lumina/protocol";

/**
 * WebSocket 连接状态。
 *
 * - `connecting`：首次连接或退避重连中
 * - `connected`：已建立连接
 * - `disconnected`：已断开，仍在自动重连窗口内
 * - `failed`：自动重连耗尽，需用户显式重试
 */
export type ConnectionStatus = "connecting" | "connected" | "disconnected" | "failed";

const GATEWAY_WS_URL = "ws://127.0.0.1:8787/ws";
const RECONNECT_BASE_MS = 2000;
const RECONNECT_MAX_MS = 30_000;
const RECONNECT_MAX_ATTEMPTS = 10;

/**
 * `useGatewaySocket` 的返回值。
 */
export type GatewaySocketState = {
  /** 当前连接状态。 */
  status: ConnectionStatus;
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
 * 管理渲染进程到 Gateway 的 WebSocket 连接。
 *
 * 职责：
 * - 挂载时自动连接，卸载时正常关闭
 * - 协议状态管理：`sessionId` 和 `seqOut` 作为一等公民
 * - 断线后指数退避自动重连，耗尽后转 `failed` 等待用户 `retry()`
 * - 断线 / 发新消息时主动清空流式状态（不依赖 `llm.final`）
 * - 使用 `@lumina/protocol` 的 `createEnvelope()` / `safeParseWsEnvelope()`
 */
export function useGatewaySocket(): GatewaySocketState {
  const [status, setStatus] = useState<ConnectionStatus>("connecting");
  const [streamingText, setStreamingText] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);

  // 协议状态：sessionId 整个组件生命周期内不变，seqOut 全局单调递增不因重连重置。
  const sessionIdRef = useRef(crypto.randomUUID());
  const seqOutRef = useRef(0);

  const socketRef = useRef<WebSocket | null>(null);
  const reconnectAttemptsRef = useRef(0);
  const reconnectTimerRef = useRef<number | null>(null);
  const disposedRef = useRef(false);

  /**
   * 清空本地流式状态（断线 / 发新消息时调用）。
   */
  const clearStreamingState = useCallback(() => {
    setStreamingText("");
    setIsStreaming(false);
  }, []);

  /**
   * 通过当前 WebSocket 发送一条包络消息。
   */
  const sendEnvelope = useCallback((type: string, payload: unknown) => {
    const ws = socketRef.current;

    if (!ws || ws.readyState !== WebSocket.OPEN) {
      return;
    }

    const envelope = createEnvelope({
      type,
      sessionId: sessionIdRef.current,
      seq: ++seqOutRef.current,
      payload
    });

    ws.send(JSON.stringify(envelope));
  }, []);

  /**
   * 建立 WebSocket 连接。
   */
  const connect = useCallback(() => {
    if (disposedRef.current) {
      return;
    }

    // 清理可能残留的旧连接。
    if (socketRef.current) {
      socketRef.current.onopen = null;
      socketRef.current.onmessage = null;
      socketRef.current.onclose = null;
      socketRef.current.onerror = null;
      socketRef.current.close();
      socketRef.current = null;
    }

    setStatus("connecting");

    const ws = new WebSocket(GATEWAY_WS_URL);
    socketRef.current = ws;

    ws.onopen = () => {
      if (disposedRef.current) {
        return;
      }

      reconnectAttemptsRef.current = 0;
      setStatus("connected");

      // 连接建立后立即发送 session.start。
      const envelope = createEnvelope({
        type: WS_EVENT_TYPE.SessionStart,
        sessionId: sessionIdRef.current,
        seq: ++seqOutRef.current,
        payload: {}
      });

      ws.send(JSON.stringify(envelope));
    };

    ws.onmessage = (event: MessageEvent) => {
      if (disposedRef.current) {
        return;
      }

      if (typeof event.data !== "string") {
        return;
      }

      const parsed = safeParseWsEnvelope(event.data);

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
    };

    ws.onclose = () => {
      if (disposedRef.current) {
        return;
      }

      socketRef.current = null;
      // 断线时立即清空流式状态。
      clearStreamingState();

      const attempts = reconnectAttemptsRef.current;

      if (attempts >= RECONNECT_MAX_ATTEMPTS) {
        setStatus("failed");
        return;
      }

      setStatus("disconnected");
      const delay = Math.min(RECONNECT_BASE_MS * Math.pow(2, attempts), RECONNECT_MAX_MS);
      reconnectAttemptsRef.current = attempts + 1;
      reconnectTimerRef.current = window.setTimeout(() => {
        reconnectTimerRef.current = null;
        connect();
      }, delay);
    };

    ws.onerror = () => {
      // onerror 之后 onclose 会紧跟触发，这里不做额外处理。
    };
  }, [clearStreamingState]);

  /**
   * 发送 `text.user` 消息。仅 `connected` 时有效。
   */
  const sendTextMessage = useCallback(
    (text: string) => {
      if (!socketRef.current || socketRef.current.readyState !== WebSocket.OPEN) {
        return;
      }

      // 发新消息前主动打断旧流（被打断的流不会收到 llm.final）。
      clearStreamingState();
      sendEnvelope(WS_EVENT_TYPE.TextUser, { text });
    },
    [clearStreamingState, sendEnvelope]
  );

  /**
   * 重连耗尽后的显式重试。
   */
  const retry = useCallback(() => {
    reconnectAttemptsRef.current = 0;
    connect();
  }, [connect]);

  useEffect(() => {
    disposedRef.current = false;
    connect();

    return () => {
      disposedRef.current = true;

      if (reconnectTimerRef.current !== null) {
        window.clearTimeout(reconnectTimerRef.current);
        reconnectTimerRef.current = null;
      }

      const ws = socketRef.current;

      if (ws) {
        ws.onopen = null;
        ws.onmessage = null;
        ws.onclose = null;
        ws.onerror = null;
        ws.close();
        socketRef.current = null;
      }
    };
  }, [connect]);

  return {
    status,
    streamingText,
    isStreaming,
    sendTextMessage,
    retry
  };
}
