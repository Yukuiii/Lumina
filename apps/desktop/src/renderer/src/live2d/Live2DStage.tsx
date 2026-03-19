import React, { useCallback, useEffect, useRef, useState } from "react";

import { resolveLive2DModelProfile } from "./config/modelProfiles";
import { createLive2DInteractionController } from "./engine/interactionController";
import { createLive2DSession } from "./engine/live2dSession";
import { useDesktopPetDrag } from "./hooks/useDesktopPetDrag";
import type { Live2DInteractionController, Live2DSession } from "./types";

/**
 * 模型命中事件与双击之间的最大间隔（毫秒）。
 *
 * 如果双击发生在上一次模型命中后的这段时间内，
 * 认为双击命中了模型本体，不触发空白区域回调。
 *
 * 已知限制：当前依赖 hit area 命中检测，模型可见区域中
 * 没有定义 hit area 的部分仍可能被误判为空白区域。
 * 完全覆盖需要 Pixi 级像素命中检测，MVP 阶段暂不引入。
 */
const MODEL_HIT_SUPPRESS_MS = 500;

/**
 * 舞台交互事件（语义化事件通道）。
 *
 * 当前仅实现 `blank-area-tap`；后续可扩展：
 * - `{ kind: 'model-tap'; hitArea: string }`
 * - `{ kind: 'context-menu'; position: { x: number; y: number } }`
 * - `{ kind: 'long-press' }`
 */
export type StageInteractionEvent =
  | { kind: "blank-area-tap" };

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
   * 舞台交互回调——语义化事件通道。
   *
   * 替代单一 `onDoubleClick` / `onBlankAreaTap`，通过 `event.kind`
   * 区分交互类型，后续扩展新手势只需新增 kind 而不改变 prop 签名。
   */
  onStageInteraction?: (event: StageInteractionEvent) => void;
};

/**
 * Live2D 舞台组件。
 *
 * 组件职责被进一步收敛为"React 组装层"：
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
  const { modelId, onStageInteraction } = props;
  const hostRef = useRef<HTMLDivElement | null>(null);
  const [errorText, setErrorText] = useState<string | null>(null);
  const { handlePointerDown, handlePointerMove, handlePointerRelease, isDragging, shouldSuppressHit } =
    useDesktopPetDrag();
  const activeModelProfile = resolveLive2DModelProfile(modelId);

  // 跟踪最近一次模型命中时间，用于过滤双击事件。
  const lastModelHitTimeRef = useRef(0);

  const handleModelHit = useCallback(() => {
    lastModelHitTimeRef.current = Date.now();
  }, []);

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
          onModelHit: handleModelHit,
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
  }, [activeModelProfile, handleModelHit]);

  /**
   * 双击事件：仅当最近没有命中模型交互区域时，才作为"空白区域双击"触发上层回调。
   */
  const handleDoubleClick = useCallback(() => {
    if (!onStageInteraction) return;

    const elapsed = Date.now() - lastModelHitTimeRef.current;

    if (elapsed < MODEL_HIT_SUPPRESS_MS) {
      // 双击命中模型本体，后续可扩展 { kind: 'model-tap' }。
      return;
    }

    onStageInteraction({ kind: "blank-area-tap" });
  }, [onStageInteraction]);

  return (
    <div
      className={`stage-shell${isDragging ? " is-dragging" : ""}`}
      onDoubleClick={handleDoubleClick}
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
 * 这类中断不应向用户暴露成"加载失败"。
 *
 * @param error 当前捕获到的错误对象。
 * @returns `true` 表示这是可静默忽略的 `AbortError`。
 */
function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === "AbortError";
}
