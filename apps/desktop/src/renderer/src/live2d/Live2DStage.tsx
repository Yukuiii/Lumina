import React, { useEffect, useRef, useState } from "react";
import * as PIXI from "pixi.js";

import { resolvePlacementAccent } from "./accents/placementAccents";
import { DEFAULT_LIVE2D_MODEL_PROFILE } from "./config/modelProfiles";
import { ensureCubismCoreLoaded } from "./engine/cubismCore";
import { resolveInteractionPlan } from "./engine/interactionResolver";
import { useDesktopPetDrag } from "./hooks/useDesktopPetDrag";
import { applyModelPlacement, fitModelToStage, fitModelWhenReady } from "./layout/modelPlacement";
import type {
  Live2DWindow,
  ModelPlacement,
  PlacementAccentSpec,
  RendererWithGl,
  ResolvedInteractionPlan
} from "./types";

const ACTIVE_MODEL_PROFILE = DEFAULT_LIVE2D_MODEL_PROFILE;

/**
 * Live2D 舞台组件。
 *
 * 组件职责被刻意限制为“React 组装层”：
 * - 创建并销毁 Pixi / Live2D 运行时
 * - 连接模型 profile 与运行时执行器
 * - 挂载窗口拖动手势
 * - 渲染调试状态与错误信息
 *
 * 模型摆放、外部 accent、命中区域策略、拖动逻辑都已经拆到独立模块，
 * 以便未来切换默认模型或新增 profile 时不再继续污染组件主体。
 *
 * @returns 桌宠渲染舞台。
 */
export function Live2DStage(): React.JSX.Element {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const basePlacementRef = useRef<ModelPlacement | null>(null);
  const placementAccentFrameRef = useRef<number | null>(null);
  const interactionHoldTimerRef = useRef<number | null>(null);
  const isInteractionLockedRef = useRef<boolean>(false);
  const [errorText, setErrorText] = useState<string | null>(null);
  const [statusText, setStatusText] = useState<string | null>(null);
  const { handlePointerDown, handlePointerMove, handlePointerRelease, isDragging, shouldSuppressHit } =
    useDesktopPetDrag();

  /**
   * 初始化并持有一次完整的 Pixi / Live2D 会话。
   *
   * 这里故意使用空依赖数组：
   * - `statusText`、`errorText`、`isDragging` 这类 React 渲染态不应该触发底层会话重建
   * - `shouldSuppressHit` 是 `useEffectEvent`，只应在事件回调里读取最新逻辑，不应参与 effect 依赖
   *
   * 一旦这个 effect 因普通重渲染而重复执行，就会在 cleanup 中销毁 Pixi / Live2D，
   * 导致点击后模型闪退或直接消失。
   */
  useEffect(() => {
    const host = hostRef.current;

    if (!host) {
      return;
    }

    let disposed = false;
    let resizeObserver: ResizeObserver | null = null;
    let pixiApp: PIXI.Application | null = null;
    let cleanupMotionFinishListener: (() => void) | null = null;

    void (async () => {
      await ensureCubismCoreLoaded(window.lumina.getLive2DCoreScriptUrl());

      if (disposed) {
        return;
      }

      const live2dWindow = window as Live2DWindow;
      live2dWindow.PIXI = PIXI;
      const { Live2DModel } = await import("@jannchie/pixi-live2d-display/cubism4");

      const app = new PIXI.Application();
      await app.init({
        antialias: true,
        autoDensity: true,
        backgroundAlpha: 0,
        /**
         * 透明 Electron 窗口对预乘 alpha 非常敏感。
         *
         * 如果这里和模型贴图的实际渲染链不匹配，周围容易出现暗边、黑框或发灰边缘。
         */
        premultipliedAlpha: false,
        powerPreference: "high-performance",
        preference: "webgl",
        resizeTo: host
      });

      live2dWindow.app = app;
      (globalThis as typeof globalThis & { app?: PIXI.Application }).app = app;

      if (disposed) {
        app.destroy(true, { children: true, texture: true, textureSource: true, context: true });
        return;
      }

      pixiApp = app;
      host.replaceChildren(app.canvas);
      const rendererWithGl = app.renderer as RendererWithGl;
      const model = await Live2DModel.from(window.lumina.getLive2DModelUrl(ACTIVE_MODEL_PROFILE.entryPath), {
        autoFocus: true,
        autoHitTest: false,
        autoUpdate: true,
        ticker: app.ticker
      });

      if (disposed) {
        app.destroy(true, { children: true, texture: true, textureSource: true, context: true });
        return;
      }

      /**
       * `pixi-live2d-display` 在 Pixi v8 + Electron 组合下对 renderer 的自动探测不稳定，
       * 这里显式把当前舞台 renderer 绑定到模型实例，确保 hitTest 与渲染上下文一致。
       *
       * 该库对 `renderer` 的类型声明仍以 WebGLRenderer 为主，而 Electron + Pixi v8
       * 实际返回的 renderer 联合类型更宽。这里使用受控的 `any` 只做一次桥接赋值，
       * 避免把库的声明限制继续扩散到我们自己的类型系统中。
       */
      const unsafeModel = model as any;
      unsafeModel.renderer = rendererWithGl;
      model.eventMode = "static";
      model.cursor = "grab";
      app.stage.eventMode = "static";
      app.stage.hitArea = app.screen;
      app.stage.addChild(model);
      app.render();

      /**
       * 清理当前正在播放的外部 placement accent，并把模型恢复到基础 placement。
       */
      const clearPlacementAccent = (): void => {
        if (placementAccentFrameRef.current !== null) {
          window.cancelAnimationFrame(placementAccentFrameRef.current);
          placementAccentFrameRef.current = null;
        }

        if (basePlacementRef.current) {
          applyModelPlacement(model, basePlacementRef.current);
        }
      };

      /**
       * 播放一次外部安全 accent。
       *
       * 该动画只作用于 Pixi 容器层，不会污染模型内部参数，因此可作为
       * “模型自带 motion 不可靠时”的低风险兜底反馈。
       *
       * @param accent 需要播放的 accent 配置。
       */
      const playPlacementAccent = (accent: PlacementAccentSpec): void => {
        clearPlacementAccent();

        const startedAt = performance.now();
        const step = (now: number): void => {
          const placement = basePlacementRef.current;

          if (!placement) {
            placementAccentFrameRef.current = null;
            return;
          }

          const progress = Math.min((now - startedAt) / accent.durationMs, 1);
          applyModelPlacement(model, placement, resolvePlacementAccent(accent, progress));

          if (progress >= 1) {
            placementAccentFrameRef.current = null;
            applyModelPlacement(model, placement);
            return;
          }

          placementAccentFrameRef.current = window.requestAnimationFrame(step);
        };

        placementAccentFrameRef.current = window.requestAnimationFrame(step);
      };

      fitModelWhenReady(model, host, ACTIVE_MODEL_PROFILE.placement, (placement) => {
        if (placement) {
          basePlacementRef.current = placement;
        }
      });

      const motionManager = model.internalModel?.motionManager;

      /**
       * 清理当前交互锁对应的定时器。
       */
      const clearInteractionHoldTimer = (): void => {
        if (interactionHoldTimerRef.current === null) {
          return;
        }

        window.clearTimeout(interactionHoldTimerRef.current);
        interactionHoldTimerRef.current = null;
      };

      /**
       * 解除输入锁。
       */
      const unlockInteraction = (): void => {
        isInteractionLockedRef.current = false;
      };

      /**
       * 强制停止当前 motion，并切回 profile 定义的 Idle。
       *
       * 这一步是当前默认模型的关键安全补丁：
       * 某些点击动作会长期维持循环状态或残留部件可见，必须在固定时机回到待机。
       */
      const resumeIdleMotion = (): void => {
        clearInteractionHoldTimer();
        unlockInteraction();
        motionManager?.stopAllMotions();
        void model.motion(ACTIVE_MODEL_PROFILE.idle.group, undefined, ACTIVE_MODEL_PROFILE.idle.priority);
      };

      /**
       * 根据交互计划设置输入锁与自动回退策略。
       *
       * @param plan 已解析完成、准备执行的交互计划。
       */
      const scheduleInteractionRelease = (plan: ResolvedInteractionPlan): void => {
        if (!("lockInput" in plan) || !plan.lockInput) {
          return;
        }

        clearInteractionHoldTimer();
        isInteractionLockedRef.current = true;
        interactionHoldTimerRef.current = window.setTimeout(() => {
          if (plan.kind === "motion" && plan.resumeIdle) {
            resumeIdleMotion();
            return;
          }

          clearInteractionHoldTimer();
          unlockInteraction();
        }, plan.holdMs);
      };

      /**
       * 响应 motion 自然结束事件。
       *
       * 对于非循环或被库内部正常结束的动作，这里负责兜底清掉输入锁。
       */
      const handleMotionFinish = (): void => {
        clearInteractionHoldTimer();
        unlockInteraction();
      };

      motionManager?.on("motionFinish", handleMotionFinish);
      cleanupMotionFinishListener = () => {
        motionManager?.off("motionFinish", handleMotionFinish);
      };

      /**
       * 启动待机动作。
       *
       * Idle 使用 profile 中定义的低优先级，以避免与主动点击交互互相抢占。
       */
      void model.motion(ACTIVE_MODEL_PROFILE.idle.group, undefined, ACTIVE_MODEL_PROFILE.idle.priority);

      /**
       * 执行一次已经解析好的交互计划。
       *
       * @param plan 命中区域对应的运行时执行计划。
       */
      const executeInteractionPlan = (plan: ResolvedInteractionPlan): void => {
        if (plan.kind === "ignore") {
          return;
        }

        if (plan.kind === "accent-only") {
          scheduleInteractionRelease(plan);
          playPlacementAccent(plan.accent);
          setStatusText(plan.label);
          console.info("[Live2D]", plan.label);
          return;
        }

        void Promise.resolve(model.motion(plan.motionGroup, plan.motionIndex))
          .then((started) => {
            if (!started) {
              return;
            }

            scheduleInteractionRelease(plan);

            if (plan.accent) {
              playPlacementAccent(plan.accent);
            }

            setStatusText(plan.label);
            console.info("[Live2D]", plan.label);
          })
          .catch((error: unknown) => {
            const message = error instanceof Error ? error.message : String(error);
            setErrorText(`动作触发失败：${message}`);
          });
      };

      /**
       * 把模型命中结果转换成可执行交互。
       *
       * @param hitAreas 命中的区域名列表。
       */
      const handleHitAreas = (hitAreas: string[]): void => {
        if (shouldSuppressHit()) {
          return;
        }

        if (isInteractionLockedRef.current) {
          return;
        }

        const hitAreaName = hitAreas[0];

        if (!hitAreaName) {
          return;
        }

        const plan = resolveInteractionPlan(ACTIVE_MODEL_PROFILE, hitAreaName, model);

        if (!plan) {
          return;
        }

        executeInteractionPlan(plan);
      };

      app.stage.on("pointertap", (event: PIXI.FederatedPointerEvent) => {
        if (shouldSuppressHit()) {
          return;
        }

        const hitAreas = model.hitTest(event.global.x, event.global.y);

        if (!hitAreas.length) {
          return;
        }

        handleHitAreas(hitAreas);
      });

      resizeObserver = new ResizeObserver(() => {
        const placement = fitModelToStage(model, host, ACTIVE_MODEL_PROFILE.placement);

        if (placement) {
          basePlacementRef.current = placement;
        }
      });
      resizeObserver.observe(host);
    })().catch((error: unknown) => {
      const message = error instanceof Error ? error.message : String(error);
      setErrorText(`加载失败：${message}`);
    });

    return () => {
      disposed = true;

      if (placementAccentFrameRef.current !== null) {
        window.cancelAnimationFrame(placementAccentFrameRef.current);
        placementAccentFrameRef.current = null;
      }

      if (interactionHoldTimerRef.current !== null) {
        window.clearTimeout(interactionHoldTimerRef.current);
        interactionHoldTimerRef.current = null;
      }

      isInteractionLockedRef.current = false;
      resizeObserver?.disconnect();
      cleanupMotionFinishListener?.();
      pixiApp?.stage.removeAllListeners();
      pixiApp?.destroy(true, { children: true, texture: true, textureSource: true, context: true });
      host.replaceChildren();
    };
  }, []);

  return (
    <div
      className={`stage-shell${isDragging ? " is-dragging" : ""}`}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerRelease}
      onPointerCancel={handlePointerRelease}
    >
      <div ref={hostRef} className="stage-canvas" />
      {statusText ? <div className="stage-overlay">{statusText}</div> : null}
      {errorText ? <div className="stage-overlay is-error">{errorText}</div> : null}
    </div>
  );
}
