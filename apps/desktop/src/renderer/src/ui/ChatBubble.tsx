import React, { useEffect, useRef, useState } from "react";

const FADE_DELAY_MS = 5000;

/**
 * 对话气泡组件参数。
 */
type ChatBubbleProps = {
  /** 是否正在接收 llm.delta 流。 */
  isStreaming: boolean;
  /** 淡出完毕后的回调。 */
  onFadeComplete: () => void;
  /** 气泡显示的文本（来自 llm.delta 累积）。 */
  text: string;
};

/**
 * 模型头顶的对话气泡。
 *
 * - 流式时文本末尾显示闪烁光标 `▍`
 * - 流结束后 5 秒自动淡出
 * - 新文本到达时重置淡出定时器
 */
export function ChatBubble(props: ChatBubbleProps): React.JSX.Element | null {
  const { text, isStreaming, onFadeComplete } = props;
  const [isFading, setIsFading] = useState(false);
  const fadeTimerRef = useRef<number | null>(null);
  const onFadeCompleteRef = useRef(onFadeComplete);
  onFadeCompleteRef.current = onFadeComplete;

  useEffect(() => {
    if (fadeTimerRef.current !== null) {
      window.clearTimeout(fadeTimerRef.current);
      fadeTimerRef.current = null;
    }

    setIsFading(false);

    if (isStreaming || !text) {
      return;
    }

    // 流结束后启动淡出倒计时。
    fadeTimerRef.current = window.setTimeout(() => {
      fadeTimerRef.current = null;
      setIsFading(true);
    }, FADE_DELAY_MS);

    return () => {
      if (fadeTimerRef.current !== null) {
        window.clearTimeout(fadeTimerRef.current);
        fadeTimerRef.current = null;
      }
    };
  }, [text, isStreaming]);

  if (!text) {
    return null;
  }

  const handleTransitionEnd = (): void => {
    if (isFading) {
      onFadeCompleteRef.current();
    }
  };

  return (
    <div
      className={`chat-bubble${isFading ? " is-fading" : ""}`}
      onTransitionEnd={handleTransitionEnd}
    >
      <div className="chat-bubble-content">
        {text}
        {isStreaming ? <span className="chat-bubble-cursor">▍</span> : null}
      </div>
      <div className="chat-bubble-tail" />
    </div>
  );
}
