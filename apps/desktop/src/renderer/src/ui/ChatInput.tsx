import React, { useEffect, useRef, useState } from "react";

/**
 * 对话输入栏组件参数。
 */
type ChatInputProps = {
  /** 是否禁用输入（非 connected 状态）。 */
  disabled: boolean;
  /** 关闭输入栏。 */
  onClose: () => void;
  /** 重连耗尽后的重试回调。 */
  onRetry: () => void;
  /** 发送消息。 */
  onSend: (text: string) => void;
  /** 输入框占位文本。 */
  placeholder: string;
  /** 是否显示重试按钮（`failed` 状态）。 */
  showRetry: boolean;
};

/**
 * 底部浮动输入栏。
 *
 * - `Enter` 发送（仅 connected 时）
 * - `Escape` 关闭
 * - 自动聚焦
 * - `failed` 状态下发送按钮变为重试按钮
 */
export function ChatInput(props: ChatInputProps): React.JSX.Element {
  const { disabled, placeholder, showRetry, onSend, onClose, onRetry } = props;
  const [value, setValue] = useState("");
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    // 挂载后自动聚焦，延迟一帧确保 DOM 已渲染。
    const frame = window.requestAnimationFrame(() => {
      inputRef.current?.focus();
    });

    return () => {
      window.cancelAnimationFrame(frame);
    };
  }, []);

  const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>): void => {
    if (event.key === "Escape") {
      event.preventDefault();
      onClose();
      return;
    }

    if (event.key === "Enter" && !event.nativeEvent.isComposing && !disabled) {
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
    if (showRetry) {
      onRetry();
      return;
    }

    if (disabled) {
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

  return (
    <div className="chat-input">
      <input
        ref={inputRef}
        className="chat-input-field"
        disabled={disabled && !showRetry}
        onChange={(event) => setValue(event.target.value)}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        type="text"
        value={value}
      />
      <button
        className="chat-input-send"
        onClick={handleSendClick}
        type="button"
      >
        {showRetry ? (
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
