import React, { useCallback, useEffect, useRef, useState } from "react";
import { useGatewaySocket } from "../hooks/useGatewaySocket";
import { Live2DStage } from "../live2d/Live2DStage";
import { ChatBubble } from "./ChatBubble";
import { ChatInput } from "./ChatInput";
import { ConnectionDot } from "./ConnectionDot";

/**
 * 从当前地址栏 query 中解析模型切换参数。
 *
 * 当前先提供一个零 UI 的模型切换入口：
 * - `?model=aierdeliqi_5`
 * - `?model=pinghai_4`
 *
 * 后续若接入设置面板或持久化配置，可以把该逻辑上移，
 * 但 `Live2DStage` 仍只接收明确的 `modelId`。
 *
 * @returns 当前请求的模型 id；若未传则返回 `undefined`。
 */
function getRequestedModelId(): string | undefined {
  const modelId = new URLSearchParams(window.location.search).get("model");

  if (modelId) {
    return modelId.trim() || undefined;
  }

  const envModelId = import.meta.env.VITE_LIVE2D_MODEL_ID;

  if (typeof envModelId === "string") {
    return envModelId.trim() || undefined;
  }

  return undefined;
}

/**
 * 根据连接状态返回输入栏 placeholder。
 */
function getInputPlaceholder(status: string): string {
  switch (status) {
    case "connected":
      return "说点什么…";
    case "failed":
      return "连接失败";
    default:
      return "连接中…";
  }
}

/**
 * 桌宠渲染进程 UI。
 *
 * 负责编排 Gateway 连接、输入框可见性、气泡展示和全局快捷键。
 * Live2D 渲染委托给 `Live2DStage`。
 */
export function App(): React.JSX.Element {
  const { status, streamingText, isStreaming, sendTextMessage, retry } =
    useGatewaySocket();
  const [showInput, setShowInput] = useState(false);
  const [bubbleText, setBubbleText] = useState("");
  const [bubbleStreaming, setBubbleStreaming] = useState(false);
  const [showBubble, setShowBubble] = useState(false);
  const [showHoverHint, setShowHoverHint] = useState(false);
  const hoverHintShownRef = useRef(false);
  const hoverTimerRef = useRef<number | null>(null);

  // 同步 streamingText → 气泡状态。
  useEffect(() => {
    if (streamingText) {
      setBubbleText(streamingText);
      setBubbleStreaming(isStreaming);
      setShowBubble(true);
    } else if (!isStreaming) {
      setBubbleStreaming(false);
    }
  }, [streamingText, isStreaming]);

  // 全局 Enter 快捷键（窗口聚焦时）→ 弹出输入框。
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent): void => {
      if (event.key === "Enter" && !showInput) {
        event.preventDefault();
        setShowInput(true);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [showInput]);

  const handleSend = useCallback(
    (text: string) => {
      // 发新消息前清空旧气泡。
      setBubbleText("");
      setShowBubble(false);
      sendTextMessage(text);
    },
    [sendTextMessage]
  );

  const handleBubbleFadeComplete = useCallback(() => {
    setShowBubble(false);
    setBubbleText("");
  }, []);

  const handleDoubleClick = useCallback(() => {
    setShowInput(true);
  }, []);

  const handleCloseInput = useCallback(() => {
    setShowInput(false);
  }, []);

  // 鼠标悬停提示：hover 2 秒后显示，每次会话仅一次。
  const handleMouseEnter = useCallback(() => {
    if (hoverHintShownRef.current || showInput) {
      return;
    }

    hoverTimerRef.current = window.setTimeout(() => {
      hoverTimerRef.current = null;
      hoverHintShownRef.current = true;
      setShowHoverHint(true);

      // 3 秒后自动隐藏（由 CSS fade-in-out 动画控制，这里做清理）。
      window.setTimeout(() => {
        setShowHoverHint(false);
      }, 3000);
    }, 2000);
  }, [showInput]);

  const handleMouseLeave = useCallback(() => {
    if (hoverTimerRef.current !== null) {
      window.clearTimeout(hoverTimerRef.current);
      hoverTimerRef.current = null;
    }
  }, []);

  // 点击输入栏外部区域时自动收起。
  const chatInputContainerRef = useRef<HTMLDivElement | null>(null);

  const handleAppPointerDown = useCallback(
    (event: React.PointerEvent) => {
      if (!showInput) return;

      // 如果点击发生在输入栏内部，不处理。
      if (
        chatInputContainerRef.current &&
        chatInputContainerRef.current.contains(event.target as Node)
      ) {
        return;
      }

      setShowInput(false);
    },
    [showInput]
  );

  return (
    <div
      className="app"
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      onPointerDown={handleAppPointerDown}
    >
      <Live2DStage
        modelId={getRequestedModelId()}
        onDoubleClick={handleDoubleClick}
      />
      <ConnectionDot status={status} />
      {showBubble && bubbleText ? (
        <ChatBubble
          isStreaming={bubbleStreaming}
          onFadeComplete={handleBubbleFadeComplete}
          text={bubbleText}
        />
      ) : null}
      {showHoverHint && !showInput ? (
        <div className="hover-hint">按 Enter 开始对话</div>
      ) : null}
      {showInput ? (
        <div ref={chatInputContainerRef}>
          <ChatInput
            disabled={status !== "connected"}
            onClose={handleCloseInput}
            onRetry={retry}
            onSend={handleSend}
            placeholder={getInputPlaceholder(status)}
            showRetry={status === "failed"}
          />
        </div>
      ) : null}
    </div>
  );
}
