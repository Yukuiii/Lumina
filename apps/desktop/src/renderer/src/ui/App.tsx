import React, { useCallback, useEffect, useRef, useState } from "react";
import { useGatewaySocket } from "../hooks/useGatewaySocket";
import type { ConnectionStatus } from "../hooks/useGatewaySocket";
import { useAsr } from "../hooks/useAsr";
import { Live2DStage } from "../live2d/Live2DStage";
import type { StageInteractionEvent } from "../live2d/Live2DStage";
import { ChatBubble } from "./ChatBubble";
import { ChatInput } from "./ChatInput";
import type { InputMode } from "./ChatInput";
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
 * 连接状态 → 输入栏 placeholder。
 */
function getInputPlaceholder(status: ConnectionStatus): string {
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
 * 连接状态 → 输入栏模式。
 */
function getInputMode(status: ConnectionStatus): InputMode {
  switch (status) {
    case "connected":
      return "active";
    case "failed":
      return "failed";
    default:
      return "disabled";
  }
}

/**
 * 桌宠渲染进程 UI。
 *
 * 负责编排 Gateway 连接、输入框可见性、气泡展示、设置面板和全局快捷键。
 * Live2D 渲染委托给 `Live2DStage`。
 */
export function App(): React.JSX.Element {
  const { status, streamingText, errorText, isStreaming, sendTextMessage, retry } =
    useGatewaySocket();

  const { asrStatus, partialTranscript, isAsrSupported, startListening, stopListening } = useAsr({
    onFinalTranscript: (text) => {
      sendTextMessage(text);
    }
  });

  const [showInput, setShowInput] = useState(false);
  const [showHoverHint, setShowHoverHint] = useState(false);
  const hoverHintShownRef = useRef(false);
  const hoverTimerRef = useRef<number | null>(null);

  // 气泡状态：直接从 hook 的 bubbleText 派生，仅维护一个 "dismissed" 标记。
  // bubbleText 变空（断线/发新消息）时气泡立刻消失，淡出完成后标记 dismissed。
  const [bubbleDismissed, setBubbleDismissed] = useState(false);
  const prevBubbleTextRef = useRef("");

  // 错误提示优先于流式文本，避免 partial delta 把错误信息盖住。
  const bubbleText = errorText || streamingText;

  // 当气泡文本变化（新文本 / 错误 / 被清空）时，重置 dismissed 标记。
  useEffect(() => {
    if (bubbleText !== prevBubbleTextRef.current) {
      prevBubbleTextRef.current = bubbleText;
      setBubbleDismissed(false);
    }
  }, [bubbleText]);

  // 气泡显示条件：有流式文本或有错误文本时显示。
  const showBubble = !!bubbleText && !bubbleDismissed;

  // 全局 Enter 快捷键（窗口聚焦时）→ 弹出输入框。
  // 全局 Cmd+, / Ctrl+, → 打开设置子窗口。
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent): void => {
      // Cmd+, / Ctrl+, → 设置子窗口
      if (event.key === "," && (event.metaKey || event.ctrlKey)) {
        event.preventDefault();
        void window.lumina.openSettings();
        return;
      }

      // Enter → 输入框
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
      sendTextMessage(text);
    },
    [sendTextMessage]
  );

  const handleBubbleFadeComplete = useCallback(() => {
    setBubbleDismissed(true);
  }, []);

  const handleStageInteraction = useCallback((event: StageInteractionEvent) => {
    switch (event.kind) {
      case "blank-area-tap":
        setShowInput(true);
        break;
    }
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
        onStageInteraction={handleStageInteraction}
      />
      <ConnectionDot status={status} />
      {showBubble ? (
        <ChatBubble
          isStreaming={isStreaming}
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
            mode={getInputMode(status)}
            onClose={handleCloseInput}
            onRetry={retry}
            onSend={handleSend}
            placeholder={getInputPlaceholder(status)}
            isAsrSupported={isAsrSupported}
            asrStatus={asrStatus}
            partialTranscript={partialTranscript}
            onStartListening={startListening}
            onStopListening={stopListening}
          />
        </div>
      ) : null}
    </div>
  );
}
