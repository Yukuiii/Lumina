import React, { useEffect, useRef, useState } from "react";
import type { AsrStatus } from "../asr/types";

/**
 * 输入栏模式，直接映射连接状态。
 *
 * - `active`：已连接，允许输入和发送
 * - `disabled`：连接中 / 已断开，输入和按钮均不可用
 * - `failed`：重连耗尽，输入禁用，按钮变为"重试"
 */
export type InputMode = "active" | "disabled" | "failed";

/**
 * 对话输入栏组件参数。
 */
type ChatInputProps = {
  /** 输入栏当前模式。 */
  mode: InputMode;
  /** 关闭输入栏。 */
  onClose: () => void;
  /** 重连耗尽后的重试回调。 */
  onRetry: () => void;
  /** 发送消息。 */
  onSend: (text: string) => void;
  /** 输入框占位文本。 */
  placeholder: string;
  /** 浏览器是否支持 ASR。 */
  isAsrSupported: boolean;
  /** 当前 ASR 状态。 */
  asrStatus: AsrStatus;
  /** 中间识别文本。 */
  partialTranscript: string;
  /** 开始语音识别。 */
  onStartListening: () => void;
  /** 停止语音识别。 */
  onStopListening: () => void;
};

/**
 * 底部浮动输入栏。
 *
 * - `Enter` 发送（仅 `active` 模式）
 * - `Escape` 关闭
 * - 自动聚焦
 * - `failed` 模式下发送按钮变为重试按钮，输入框禁用
 */
export function ChatInput(props: ChatInputProps): React.JSX.Element {
  const {
    mode, placeholder, onSend, onClose, onRetry,
    isAsrSupported, asrStatus, partialTranscript, onStartListening, onStopListening
  } = props;
  const [value, setValue] = useState("");
  const inputRef = useRef<HTMLInputElement | null>(null);

  const isActive = mode === "active";
  const isFailed = mode === "failed";
  const isListening = asrStatus === "listening";

  // 跟踪麦克风按钮是否处于按压状态，用 ref 避免 closure 过期。
  const micPressedRef = useRef(false);

  useEffect(() => {
    // active 模式下挂载后自动聚焦，延迟一帧确保 DOM 已渲染。
    if (!isActive) return;

    const frame = window.requestAnimationFrame(() => {
      inputRef.current?.focus();
    });

    return () => {
      window.cancelAnimationFrame(frame);
    };
  }, [isActive]);

  const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>): void => {
    if (event.key === "Escape") {
      event.preventDefault();
      onClose();
      return;
    }

    if (event.key === "Enter" && !event.nativeEvent.isComposing && isActive) {
      event.preventDefault();
      const trimmed = value.trim();

      if (!trimmed) {
        return;
      }

      onSend(trimmed);
      setValue("");
    }
  };

  const handleSendClick = (): void => {
    if (isFailed) {
      onRetry();
      return;
    }

    if (!isActive) {
      return;
    }

    const trimmed = value.trim();

    if (!trimmed) {
      return;
    }

    onSend(trimmed);
    setValue("");
    inputRef.current?.focus();
  };

  /** 按下麦克风按钮开始识别。 */
  const handleMicPointerDown = (event: React.PointerEvent<HTMLButtonElement>): void => {
    event.preventDefault();
    micPressedRef.current = true;
    onStartListening();
  };

  // 全局 pointerup 监听：松开时停止识别，无论指针在哪里。
  useEffect(() => {
    const handleGlobalPointerUp = (): void => {
      if (micPressedRef.current) {
        micPressedRef.current = false;
        onStopListening();
      }
    };

    window.addEventListener("pointerup", handleGlobalPointerUp);
    return () => window.removeEventListener("pointerup", handleGlobalPointerUp);
  }, [onStopListening]);

  return (
    <div className="chat-input">
      <input
        ref={inputRef}
        className="chat-input-field"
        disabled={!isActive || isListening}
        onChange={(event) => setValue(event.target.value)}
        onKeyDown={handleKeyDown}
        placeholder={isListening ? (partialTranscript || "正在聆听…") : placeholder}
        type="text"
        value={isListening ? "" : value}
      />
      {isAsrSupported && isActive ? (
        <button
          className={`chat-input-mic${isListening ? " is-listening" : ""}`}
          onPointerDown={handleMicPointerDown}
          type="button"
        >
          <svg viewBox="0 0 16 16">
            <rect x="5" y="1" width="6" height="9" rx="3" />
            <path d="M3 7a5 5 0 0 0 10 0" />
            <line x1="8" y1="12" x2="8" y2="15" />
            <line x1="5" y1="15" x2="11" y2="15" />
          </svg>
        </button>
      ) : null}
      <button
        className="chat-input-send"
        disabled={isListening}
        onClick={handleSendClick}
        type="button"
      >
        {isFailed ? (
          <svg viewBox="0 0 16 16">
            <path d="M13 7a5 5 0 0 0-9.17-1.5M3 9a5 5 0 0 0 9.17 1.5" />
            <polyline points="13 3 13 7 9 7" />
            <polyline points="3 13 3 9 7 9" />
          </svg>
        ) : (
          <svg viewBox="0 0 16 16">
            <line x1="8" y1="12" x2="8" y2="4" />
            <polyline points="4 7 8 3 12 7" />
          </svg>
        )}
      </button>
    </div>
  );
}
