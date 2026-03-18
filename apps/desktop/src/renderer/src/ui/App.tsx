import React, { useEffectEvent, useMemo, useRef, useState } from "react";
import * as protocol from "@lumina/protocol";
import type { WsEnvelope } from "@lumina/protocol";
import { Live2DStage } from "../live2d/Live2DStage";

const { createEnvelope, WS_EVENT_TYPE } = protocol;

type ConnectionState = "disconnected" | "connecting" | "connected";

/**
 * 桌宠渲染进程 UI（MVP：先打通 WS 文本流）。
 */
export function App(): React.JSX.Element {
  const [gatewayUrl, setGatewayUrl] = useState<string>("ws://127.0.0.1:8787/ws");
  const [connectionState, setConnectionState] = useState<ConnectionState>("disconnected");
  const [inputText, setInputText] = useState<string>("");
  const [log, setLog] = useState<string>("");

  const sessionId = useMemo(() => crypto.randomUUID(), []);
  const seqRef = useRef<number>(0);
  const wsRef = useRef<WebSocket | null>(null);

  /**
   * 追加一行日志（用于联调可视化）。
   */
  const appendLog = useEffectEvent((line: string): void => {
    setLog((prev) => (prev ? `${prev}\n${line}` : line));
  });

  /**
   * 连接到 Gateway WebSocket。
   */
  const connect = (): void => {
    if (wsRef.current) return;
    setConnectionState("connecting");

    const ws = new WebSocket(gatewayUrl);
    wsRef.current = ws;

    ws.onopen = () => {
      setConnectionState("connected");
      appendLog("[ws] connected");

      // 约定：建立连接后发送 session.start，便于未来扩展鉴权/会话参数。
      const envelope = createEnvelope({
        type: WS_EVENT_TYPE.SessionStart,
        sessionId,
        seq: ++seqRef.current,
        payload: { clientName: "desktop", clientVersion: "0.1.0" }
      });
      ws.send(JSON.stringify(envelope));
    };

    ws.onclose = () => {
      appendLog("[ws] closed");
      wsRef.current = null;
      setConnectionState("disconnected");
    };

    ws.onerror = () => {
      appendLog("[ws] error");
    };

    ws.onmessage = (event) => {
      const text = typeof event.data === "string" ? event.data : "";
      if (!text) return;
      try {
        const envelope = JSON.parse(text) as WsEnvelope;
        handleServerEnvelope(envelope);
      } catch {
        appendLog(`[ws] bad message: ${text.slice(0, 200)}`);
      }
    };
  };

  /**
   * 断开与 Gateway 的连接。
   */
  const disconnect = (): void => {
    wsRef.current?.close();
  };

  /**
   * 发送一条开发期的文本输入事件（用于验证 llm.delta 流式 UI）。
   */
  const sendTextUser = (): void => {
    const ws = wsRef.current;
    if (!ws || connectionState !== "connected") return;
    const text = inputText.trim();
    if (!text) return;

    setInputText("");
    appendLog(`[user] ${text}`);

    const envelope = createEnvelope({
      type: WS_EVENT_TYPE.TextUser,
      sessionId,
      seq: ++seqRef.current,
      payload: { text }
    });
    ws.send(JSON.stringify(envelope));
  };

  /**
   * 打断当前流式输出（用于验证 barge-in 的最小链路）。
   */
  const interrupt = (): void => {
    const ws = wsRef.current;
    if (!ws || connectionState !== "connected") return;

    const envelope = createEnvelope({
      type: WS_EVENT_TYPE.ControlInterrupt,
      sessionId,
      seq: ++seqRef.current,
      payload: { reason: "barge_in" }
    });
    ws.send(JSON.stringify(envelope));
    appendLog("[control] interrupt");
  };

  /**
   * 处理服务端消息（MVP：llm.delta/llm.final/error）。
   */
  const handleServerEnvelope = (envelope: WsEnvelope): void => {
    switch (envelope.type) {
      case WS_EVENT_TYPE.LlmDelta: {
        const payload = envelope.payload as { textDelta?: unknown };
        const delta = typeof payload.textDelta === "string" ? payload.textDelta : "";
        if (delta) appendLog(`[llm.delta] ${delta}`);
        return;
      }
      case WS_EVENT_TYPE.LlmFinal: {
        const payload = envelope.payload as { text?: unknown };
        const text = typeof payload.text === "string" ? payload.text : "";
        appendLog(`[llm.final] ${text}`);
        return;
      }
      case WS_EVENT_TYPE.Error: {
        const payload = envelope.payload as { code?: unknown; message?: unknown };
        const code = typeof payload.code === "string" ? payload.code : "unknown";
        const message = typeof payload.message === "string" ? payload.message : "";
        appendLog(`[error] ${code}: ${message}`);
        return;
      }
      default: {
        // v0 联调阶段：未知事件只记录，避免 UI 被无关事件打爆。
        appendLog(`[ws] event: ${envelope.type}`);
      }
    }
  };

  return (
    <div className="app">
      <div className="panel">
        <div className="row" style={{ justifyContent: "space-between" }}>
          <div className="status">状态：{connectionState}</div>
          <div className="status">sessionId：{sessionId.slice(0, 8)}…</div>
        </div>
        <div className="row" style={{ marginTop: 8 }}>
          <input
            style={{ flex: 1 }}
            value={gatewayUrl}
            onChange={(e) => setGatewayUrl(e.target.value)}
            placeholder="ws://127.0.0.1:8787/ws"
          />
          {connectionState !== "connected" ? (
            <button onClick={connect}>连接</button>
          ) : (
            <button onClick={disconnect}>断开</button>
          )}
        </div>
      </div>

      <div className="panel panel-stage">
        <Live2DStage onLog={appendLog} />
      </div>

      <div className="panel">
        <div className="row">
          <input
            style={{ flex: 1 }}
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            placeholder="输入一句话，测试 llm.delta 流式输出"
            onKeyDown={(e) => {
              if (e.key === "Enter") sendTextUser();
            }}
          />
          <button onClick={sendTextUser}>发送</button>
          <button onClick={interrupt}>打断</button>
        </div>
        <div className="log log-compact">{log || "（暂无日志）"}</div>
      </div>
    </div>
  );
}
