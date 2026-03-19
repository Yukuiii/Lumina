import { useCallback, useEffect, useRef, useState } from "react";

/**
 * WebSocket 传输层连接状态。
 *
 * - `connecting`：首次连接或退避重连中
 * - `connected`：已建立连接
 * - `disconnected`：已断开，仍在自动重连窗口内
 * - `failed`：自动重连耗尽，需用户显式重试
 */
export type TransportStatus = "connecting" | "connected" | "disconnected" | "failed";

const RECONNECT_BASE_MS = 2000;
const RECONNECT_MAX_MS = 30_000;
const RECONNECT_MAX_ATTEMPTS = 10;

/**
 * `useWebSocketTransport` 的配置参数。
 */
type WebSocketTransportOptions = {
  /** WebSocket 服务端 URL。 */
  url: string;
  /** 连接建立后的回调。 */
  onOpen?: (ws: WebSocket) => void;
  /** 收到消息的回调。 */
  onMessage?: (data: string) => void;
  /** 连接断开（进入重连或 failed）前的回调，用于清理上层流式状态。 */
  onDisconnect?: () => void;
};

/**
 * `useWebSocketTransport` 的返回值。
 */
export type WebSocketTransportState = {
  /** 当前连接状态。 */
  status: TransportStatus;
  /** 通过当前连接发送原始字符串。仅 `connected` 时有效，返回是否发送成功。 */
  send: (data: string) => boolean;
  /** 重连耗尽后的显式重试入口。 */
  retry: () => void;
};

/**
 * 管理一条 WebSocket 连接的传输层。
 *
 * 职责（仅传输 + 重连）：
 * - 挂载时自动连接，卸载时正常关闭
 * - 断线后指数退避自动重连，耗尽后转 `failed`
 * - 提供 `send()` 和 `retry()` 接口
 * - 通过回调通知上层连接事件（open、message、disconnect）
 *
 * 不关心协议格式、sessionId/seq、消息解析等上层逻辑。
 */
export function useWebSocketTransport(options: WebSocketTransportOptions): WebSocketTransportState {
  const { url, onOpen, onMessage, onDisconnect } = options;
  const [status, setStatus] = useState<TransportStatus>("connecting");

  const socketRef = useRef<WebSocket | null>(null);
  const reconnectAttemptsRef = useRef(0);
  const reconnectTimerRef = useRef<number | null>(null);
  const disposedRef = useRef(false);

  // 用 ref 持有最新的回调，避免 connect 因回调变化而重建。
  const callbacksRef = useRef({ onOpen, onMessage, onDisconnect });
  callbacksRef.current = { onOpen, onMessage, onDisconnect };

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

    const ws = new WebSocket(url);
    socketRef.current = ws;

    ws.onopen = () => {
      if (disposedRef.current) {
        return;
      }

      reconnectAttemptsRef.current = 0;
      setStatus("connected");
      callbacksRef.current.onOpen?.(ws);
    };

    ws.onmessage = (event: MessageEvent) => {
      if (disposedRef.current) {
        return;
      }

      if (typeof event.data !== "string") {
        return;
      }

      callbacksRef.current.onMessage?.(event.data);
    };

    ws.onclose = () => {
      if (disposedRef.current) {
        return;
      }

      socketRef.current = null;
      callbacksRef.current.onDisconnect?.();

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
  }, [url]);

  /**
   * 通过当前连接发送原始字符串。仅 `connected` 时有效。
   */
  const send = useCallback((data: string): boolean => {
    const ws = socketRef.current;

    if (!ws || ws.readyState !== WebSocket.OPEN) {
      return false;
    }

    ws.send(data);
    return true;
  }, []);

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

  return { status, send, retry };
}
