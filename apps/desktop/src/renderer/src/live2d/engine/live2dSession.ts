import type { Live2DModel as Live2DModelType } from "@jannchie/pixi-live2d-display/cubism4";
import * as PIXI from "pixi.js";

import { resolvePlacementAccent } from "../accents/placementAccents";
import { ensureCubismCoreLoaded } from "../engine/cubismCore";
import { applyModelPlacement, fitModelToStage, fitModelWhenReady } from "../layout/modelPlacement";
import type {
  Live2DModelProfile,
  Live2DSession,
  Live2DWindow,
  ModelPlacement,
  PlacementAccentSpec,
  RendererWithGl
} from "../types";

/**
 * 创建一份完整的 Pixi + Live2D 会话。
 *
 * 会话层负责底层运行时资源：
 * - 加载 Cubism Core
 * - 创建 Pixi Application
 * - 加载 Live2DModel
 * - 维护基础 placement 与外部 accent
 * - 暴露命中、motion、销毁等最小接口
 *
 * 组件层不应再直接拼装这些细节。
 *
 * @param host 承载 Pixi canvas 的 DOM 容器。
 * @param profile 当前启用的模型 profile。
 * @returns 可被交互控制层消费的会话对象。
 */
export async function createLive2DSession(
  host: HTMLElement,
  profile: Live2DModelProfile,
  signal?: AbortSignal
): Promise<Live2DSession> {
  let app: PIXI.Application | null = null;
  let model: Live2DModelType | null = null;
  let mountedCanvas: HTMLCanvasElement | null = null;

  try {
    throwIfSessionAborted(signal);
    await ensureCubismCoreLoaded(window.lumina.getLive2DCoreScriptUrl());
    throwIfSessionAborted(signal);

    const live2dWindow = window as Live2DWindow;
    live2dWindow.PIXI = PIXI;
    const { Live2DModel } = await import("@jannchie/pixi-live2d-display/cubism4");
    app = new PIXI.Application();

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
    throwIfSessionAborted(signal);

    const rendererWithGl = app.renderer as RendererWithGl;
    throwIfSessionAborted(signal);
    model = await Live2DModel.from(window.lumina.getLive2DModelUrl(profile.entryPath), {
      autoFocus: true,
      autoHitTest: false,
      autoUpdate: true,
      ticker: app.ticker
    });
    throwIfSessionAborted(signal);

    const readyApp = app;
    const readyModel = model;

    live2dWindow.app = readyApp;
    (globalThis as typeof globalThis & { app?: PIXI.Application }).app = readyApp;
    host.replaceChildren(readyApp.canvas);
    mountedCanvas = readyApp.canvas;

    /**
     * `pixi-live2d-display` 在 Pixi v8 + Electron 组合下对 renderer 的自动探测不稳定，
     * 这里显式把当前舞台 renderer 绑定到模型实例，确保 hitTest 与渲染上下文一致。
     *
     * 该库对 `renderer` 的类型声明仍以 WebGLRenderer 为主，而 Electron + Pixi v8
     * 实际返回的 renderer 联合类型更宽。这里使用受控的 `any` 只做一次桥接赋值，
     * 避免把库的声明限制继续扩散到我们自己的类型系统中。
     */
    const unsafeModel = readyModel as any;
    unsafeModel.renderer = rendererWithGl;
    readyModel.eventMode = "static";
    readyModel.cursor = "grab";
    readyApp.stage.eventMode = "static";
    readyApp.stage.hitArea = readyApp.screen;
    readyApp.stage.addChild(readyModel);
    readyApp.render();

    let basePlacement: ModelPlacement | null = null;
    let placementAccentFrameId: number | null = null;
    let resizeObserver: ResizeObserver | null = null;
    let destroyed = false;

    /**
     * 清理当前正在播放的外部 placement accent，并把模型恢复到基础 placement。
     */
    const clearPlacementAccent = (): void => {
      if (placementAccentFrameId !== null) {
        window.cancelAnimationFrame(placementAccentFrameId);
        placementAccentFrameId = null;
      }

      if (basePlacement) {
        applyModelPlacement(readyModel, basePlacement);
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
        if (destroyed) {
          placementAccentFrameId = null;
          return;
        }

        if (!basePlacement) {
          placementAccentFrameId = null;
          return;
        }

        const progress = Math.min((now - startedAt) / accent.durationMs, 1);
        applyModelPlacement(readyModel, basePlacement, resolvePlacementAccent(accent, progress));

        if (progress >= 1) {
          placementAccentFrameId = null;
          applyModelPlacement(readyModel, basePlacement);
          return;
        }

        placementAccentFrameId = window.requestAnimationFrame(step);
      };

      placementAccentFrameId = window.requestAnimationFrame(step);
    };

    fitModelWhenReady(readyModel, host, profile.placement, (placement) => {
      if (placement) {
        basePlacement = placement;
      }
    });

    resizeObserver = new ResizeObserver(() => {
      const placement = fitModelToStage(readyModel, host, profile.placement);

      if (placement) {
        basePlacement = placement;
      }
    });
    resizeObserver.observe(host);

    return {
      destroy(): void {
        if (destroyed) {
          return;
        }

        destroyed = true;
        clearPlacementAccent();
        resizeObserver?.disconnect();
        destroyLive2DSessionRuntime({ app: readyApp, host, model: readyModel, mountedCanvas });
      },

      model: readyModel,

      onHit(listener: (hitAreas: string[]) => void): () => void {
        const handlePointerTap = (event: PIXI.FederatedPointerEvent): void => {
          const hitAreas = readyModel.hitTest(event.global.x, event.global.y);

          if (!hitAreas.length) {
            return;
          }

          listener(hitAreas);
        };

        readyApp.stage.on("pointertap", handlePointerTap);

        return () => {
          readyApp.stage.off("pointertap", handlePointerTap);
        };
      },

      onMotionFinish(listener: () => void): () => void {
        const motionManager = readyModel.internalModel?.motionManager;

        if (!motionManager) {
          return () => undefined;
        }

        motionManager.on("motionFinish", listener);

        return () => {
          motionManager.off("motionFinish", listener);
        };
      },

      playIdle(): Promise<boolean> {
        return readyModel.motion(profile.idle.group, undefined, profile.idle.priority);
      },

      playMotion(group: string, index?: number): Promise<boolean> {
        return readyModel.motion(group, index);
      },

      playPlacementAccent,

      stopAllMotions(): void {
        readyModel.internalModel?.motionManager.stopAllMotions();
      }
    };
  } catch (error: unknown) {
    destroyLive2DSessionRuntime({ app, host, model, mountedCanvas });
    throw error;
  }
}

/**
 * 在 session 异步初始化的关键阶段检查是否已经被上层取消。
 *
 * React StrictMode 在开发环境下会触发一次额外的 mount/unmount 循环，
 * 如果旧 session 在 cleanup 之后仍继续初始化，就可能创建出已经过期的 Pixi / WebGL 上下文，
 * 随后在销毁时引发 `deleted object` / `wrong context` 之类的噪音错误。
 *
 * @param signal 上层传入的取消信号。
 * @throws DOMException 当初始化已被取消时抛出 `AbortError`。
 */
function throwIfSessionAborted(signal?: AbortSignal): void {
  if (signal?.aborted) {
    throw new DOMException("Live2D session initialization aborted.", "AbortError");
  }
}

type DestroyLive2DSessionRuntimeOptions = {
  app: PIXI.Application | null;
  host: HTMLElement;
  model: Live2DModelType | null;
  mountedCanvas: HTMLCanvasElement | null;
};

/**
 * 安全回收当前 session 关联的 Pixi / Live2D 运行时资源。
 *
 * 这里统一处理两类场景：
 * - session 已经完成初始化，组件卸载时正常销毁
 * - session 在初始化中途被 Abort，中断后收掉半成品 WebGL 上下文
 *
 * 之所以不把回收逻辑散落在多个 `catch` / `destroy` 分支里，是因为
 * `pixi-live2d-display` 在 Electron + WebGL 环境中对销毁时序很敏感，
 * 需要保证每次都按同一顺序停 ticker、解除 autoUpdate、再销毁 app。
 *
 * @param options 待回收的运行时句柄。
 */
function destroyLive2DSessionRuntime(options: DestroyLive2DSessionRuntimeOptions): void {
  const { app, host, model, mountedCanvas } = options;

  safelyDisableModelAutoUpdate(model);

  if (app) {
    app.stop();
    app.stage.removeAllListeners();

    /**
     * 当模型尚未挂进 stage 就发生 abort 时，`app.destroy(...children)` 不会替我们销毁它。
     * 这里显式补一次，避免遗留过期的 Cubism / WebGL 资源。
     */
    if (model && model.parent !== app.stage) {
      model.destroy({ children: true, texture: true, textureSource: true });
    }

    app.destroy(true, { children: true, texture: true, textureSource: true, context: true });
  } else if (model) {
    model.destroy({ children: true, texture: true, textureSource: true });
  }

  /**
   * 只移除当前 session 自己挂上的 canvas。
   *
   * 在 React.StrictMode 下，旧 session 的异步清理可能晚于新 session 完成挂载。
   * 如果这里直接 `host.replaceChildren()`，旧 session 会把新 session 的 canvas 一并清空，
   * 最终表现为窗口黑屏或模型突然消失。
   */
  if (mountedCanvas?.parentElement === host) {
    host.removeChild(mountedCanvas);
  }
}

/**
 * 在销毁前关闭模型的自动 ticker 订阅。
 *
 * `pixi-live2d-display` 在 `destroy()` 过程中会尝试从 ticker 反注册；
 * 如果此时 ticker 或 WebGL context 已经处于过渡态，控制台容易出现
 * `deleted object`、`wrong context` 或 `_Ticker.remove` 一类噪音错误。
 *
 * @param model 待处理的模型实例。
 */
function safelyDisableModelAutoUpdate(model: Live2DModelType | null): void {
  if (!model) {
    return;
  }

  const unsafeModel = model as any;

  if ("autoUpdate" in unsafeModel) {
    unsafeModel.autoUpdate = false;
  }
}
