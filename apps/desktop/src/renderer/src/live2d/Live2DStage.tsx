import React, { useEffect, useRef, useState } from "react";

import { resolveLive2DModelProfile } from "./config/modelProfiles";
import { createLive2DInteractionController } from "./engine/interactionController";
import { createLive2DSession } from "./engine/live2dSession";
import { useDesktopPetDrag } from "./hooks/useDesktopPetDrag";
import type { Live2DInteractionController, Live2DSession } from "./types";

/**
 * Live2D 舞台组件的输入参数。
 */
export type Live2DStageProps = {
  /**
   * 当前希望加载的模型 profile id。
   *
   * 未传或未命中时，组件会自动回退到默认模型。
   */
  modelId?: string;
  /**
   * 双击舞台空白区域的回调，用于触发输入框等上层交互。
   */
  onDoubleClick?: () => void;
};

/**
 * Live2D 舞台组件。
 *
 * 组件职责被进一步收敛为“React 组装层”：
 * - 根据 `modelId` 解析当前模型 profile
 * - 创建并销毁一次完整的 Live2D session
 * - 把 session 交给 interaction controller 管理点击交互
 * - 挂载窗口拖动手势
 * - 只渲染错误态 UI，不再默认渲染调试状态文本
 *
 * 这样组件层不会再直接承载 Pixi / Live2D 的 imperative 过程，
 * 后续切换模型、替换 controller 或扩展交互策略时，影响面都会更小。
 *
 * @param props Live2D 舞台组件参数。
 * @returns 桌宠渲染舞台。
 */
export function Live2DStage(props: Live2DStageProps): React.JSX.Element {
  const { modelId, onDoubleClick } = props;
  const hostRef = useRef<HTMLDivElement | null>(null);
  const [errorText, setErrorText] = useState<string | null>(null);
  const { handlePointerDown, handlePointerMove, handlePointerRelease, isDragging, shouldSuppressHit } =
    useDesktopPetDrag();
  const activeModelProfile = resolveLive2DModelProfile(modelId);

  /**
   * 初始化并持有一次完整的 Live2D 会话。
   *
   * 这里故意只依赖 `activeModelProfile`：
   * - 普通渲染态变化不应触发底层 Pixi / Live2D 重建
   * - 只有明确切换 `modelId` 时，才允许整个 session 被销毁并重建
   * - `shouldSuppressHit` 由 `useEffectEvent` 提供，只应在 controller 的事件回调里读取最新逻辑
   */
  useEffect(() => {
    const host = hostRef.current;

    if (!host) {
      return;
    }

    const sessionAbortController = new AbortController();
    let disposed = false;
    let session: Live2DSession | null = null;
    let interactionController: Live2DInteractionController | null = null;

    setErrorText(null);

    void createLive2DSession(host, activeModelProfile, sessionAbortController.signal)
      .then((createdSession) => {
        if (disposed) {
          createdSession.destroy();
          return;
        }

        session = createdSession;
        interactionController = createLive2DInteractionController({
          onError: setErrorText,
          profile: activeModelProfile,
          session: createdSession,
          shouldSuppressHit
        });
        void createdSession.playIdle();
      })
      .catch((error: unknown) => {
        if (disposed) {
          return;
        }

        if (isAbortError(error)) {
          return;
        }

        const message = error instanceof Error ? error.message : String(error);
        setErrorText(`加载失败：${message}`);
      });

    return () => {
      disposed = true;
      sessionAbortController.abort();
      interactionController?.destroy();
      session?.destroy();
    };
  }, [activeModelProfile]);

  return (
    <div
      className={`stage-shell${isDragging ? " is-dragging" : ""}`}
      onDoubleClick={onDoubleClick}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerRelease}
      onPointerCancel={handlePointerRelease}
    >
      <div ref={hostRef} className="stage-canvas" />
      {errorText ? <div className="stage-overlay is-error">{errorText}</div> : null}
    </div>
  );
}

/**
 * 判断当前错误是否来自受控的 session 初始化取消。
 *
 * React.StrictMode 会在开发环境主动模拟一次挂载后立刻卸载，
 * 这类中断不应向用户暴露成“加载失败”。
 *
 * @param error 当前捕获到的错误对象。
 * @returns `true` 表示这是可静默忽略的 `AbortError`。
 */
function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === "AbortError";
}
