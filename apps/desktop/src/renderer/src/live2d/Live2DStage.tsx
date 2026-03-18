import React, { useEffect, useEffectEvent, useRef, useState } from "react";
import * as PIXI from "pixi.js";
import type { Live2DModel as Live2DModelType } from "@jannchie/pixi-live2d-display/cubism4";

const MODEL_ENTRY_PATH = "AzueLane/aierdeliqi_5/aierdeliqi_5.model3.json";
const MODEL_SCALE_BOOST = 1.06;
const MODEL_BOUNDS_TRIM_RATIO = 0.01;

type Live2DWindow = Window & {
  PIXI?: typeof PIXI;
  Live2DCubismCore?: unknown;
  app?: PIXI.Application;
};

type RendererWithGl = PIXI.Renderer & {
  gl?: WebGLRenderingContext | WebGL2RenderingContext;
};

type DragState = {
  pointerId: number;
  startScreenX: number;
  startScreenY: number;
  lastScreenX: number;
  lastScreenY: number;
  hasMoved: boolean;
};

let cubismCoreLoader: Promise<void> | null = null;

/**
 * 确保 Cubism Core 运行时只被加载一次。
 */
function ensureCubismCoreLoaded(scriptUrl: string): Promise<void> {
  const live2dWindow = window as Live2DWindow;

  if (live2dWindow.Live2DCubismCore) {
    return Promise.resolve();
  }

  if (cubismCoreLoader) {
    return cubismCoreLoader;
  }

  cubismCoreLoader = new Promise<void>((resolve, reject) => {
    const existingScript = document.querySelector<HTMLScriptElement>('script[data-live2d-core="true"]');

    if (existingScript) {
      existingScript.addEventListener("load", () => resolve(), { once: true });
      existingScript.addEventListener("error", () => reject(new Error("Cubism Core 脚本加载失败。")), {
        once: true
      });
      return;
    }

    const script = document.createElement("script");
    script.async = true;
    script.dataset.live2dCore = "true";
    script.src = scriptUrl;
    script.addEventListener("load", () => resolve(), { once: true });
    script.addEventListener("error", () => reject(new Error("Cubism Core 脚本加载失败。")), {
      once: true
    });
    document.head.appendChild(script);
  });

  return cubismCoreLoader;
}

/**
 * 计算模型所有 drawable 顶点的包围盒，可选忽略少量离群点，避免异常顶点把模型压得过小。
 */
function getDrawableBounds(
  model: Live2DModelType,
  trimRatio = 0
): { x: number; y: number; width: number; height: number } | null {
  const internalModel = model.internalModel;

  if (!internalModel) {
    return null;
  }

  const xs: number[] = [];
  const ys: number[] = [];
  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;

  for (const drawableId of internalModel.getDrawableIDs()) {
    const vertices = internalModel.getDrawableVertices(drawableId);

    for (let index = 0; index < vertices.length; index += 2) {
      const x = vertices[index];
      const y = vertices[index + 1];

      if (!Number.isFinite(x) || !Number.isFinite(y)) {
        continue;
      }

      xs.push(x);
      ys.push(y);
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
    }
  }

  if (!xs.length || !ys.length) {
    return null;
  }

  if (trimRatio > 0 && xs.length > 64) {
    const sortedXs = [...xs].sort((left, right) => left - right);
    const sortedYs = [...ys].sort((left, right) => left - right);
    const startIndex = Math.min(Math.floor(sortedXs.length * trimRatio), sortedXs.length - 1);
    const endIndex = Math.max(startIndex, Math.ceil(sortedXs.length * (1 - trimRatio)) - 1);

    minX = sortedXs[startIndex];
    maxX = sortedXs[endIndex];
    minY = sortedYs[startIndex];
    maxY = sortedYs[endIndex];
  }

  if (!Number.isFinite(minX) || !Number.isFinite(minY) || !Number.isFinite(maxX) || !Number.isFinite(maxY)) {
    return null;
  }

  return {
    x: minX,
    y: minY,
    width: maxX - minX,
    height: maxY - minY
  };
}

/**
 * 根据当前舞台尺寸计算模型的显示比例与位置。
 */
function fitModelToStage(model: Live2DModelType, host: HTMLElement): void {
  const stageWidth = host.clientWidth;
  const stageHeight = host.clientHeight;
  const drawableBounds = getDrawableBounds(model, MODEL_BOUNDS_TRIM_RATIO) ?? getDrawableBounds(model);

  if (!stageWidth || !stageHeight || !drawableBounds || !drawableBounds.width || !drawableBounds.height) {
    return;
  }

  const fitScale = Math.min((stageWidth * 0.84) / drawableBounds.width, (stageHeight * 0.92) / drawableBounds.height);
  // 让模型尽量占满舞台主体区域，同时保留少量安全边距避免被裁切。
  const scale = fitScale * MODEL_SCALE_BOOST;

  model.scale.set(scale);
  model.x = stageWidth / 2 - (drawableBounds.x + drawableBounds.width / 2) * scale;
  model.y = stageHeight - 12 - (drawableBounds.y + drawableBounds.height) * scale;
}

/**
 * 等待模型拿到可用尺寸后再进行舞台适配，避免首次测量为 0 导致模型几乎不可见。
 */
function fitModelWhenReady(model: Live2DModelType, host: HTMLElement, retries = 12): void {
  fitModelToStage(model, host);

  const hasLogicalSize = Boolean(model.internalModel?.width && model.internalModel?.height);
  const bounds = model.getLocalBounds();
  const hasBounds = Boolean(bounds.width && bounds.height);

  if ((hasLogicalSize || hasBounds) || retries <= 0) {
    return;
  }

  window.requestAnimationFrame(() => {
    fitModelWhenReady(model, host, retries - 1);
  });
}

/**
 * 将点击命中的区域名映射到模型 motion group。
 */
function toTapMotionGroup(hitAreaName: string): string {
  return `Tap${hitAreaName}`;
}

/**
 * Live2D 舞台组件，负责初始化 Pixi 舞台并加载本地模型。
 */
export function Live2DStage(): React.JSX.Element {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const dragStateRef = useRef<DragState | null>(null);
  const suppressHitUntilRef = useRef<number>(0);
  const [errorText, setErrorText] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState<boolean>(false);

  /**
   * 开始记录窗口拖动所需的指针状态。
   */
  const handlePointerDown = useEffectEvent((event: React.PointerEvent<HTMLDivElement>): void => {
    if (event.button !== 0) {
      return;
    }

    dragStateRef.current = {
      pointerId: event.pointerId,
      startScreenX: event.screenX,
      startScreenY: event.screenY,
      lastScreenX: event.screenX,
      lastScreenY: event.screenY,
      hasMoved: false
    };
  });

  /**
   * 根据指针位移拖动当前桌宠窗口，并在达到阈值后屏蔽误触发的点击动作。
   */
  const handlePointerMove = useEffectEvent((event: React.PointerEvent<HTMLDivElement>): void => {
    const dragState = dragStateRef.current;

    if (!dragState || dragState.pointerId !== event.pointerId) {
      return;
    }

    const totalDeltaX = event.screenX - dragState.startScreenX;
    const totalDeltaY = event.screenY - dragState.startScreenY;
    const stepDeltaX = event.screenX - dragState.lastScreenX;
    const stepDeltaY = event.screenY - dragState.lastScreenY;

    if (!dragState.hasMoved) {
      // 只有明显移动后才进入拖动状态，避免普通点击也把窗口拽走。
      if (Math.hypot(totalDeltaX, totalDeltaY) < 6) {
        return;
      }

      event.currentTarget.setPointerCapture(event.pointerId);
      dragState.hasMoved = true;
      setIsDragging(true);
    }

    if (!stepDeltaX && !stepDeltaY) {
      return;
    }

    dragState.lastScreenX = event.screenX;
    dragState.lastScreenY = event.screenY;
    window.lumina.dragWindowBy(stepDeltaX, stepDeltaY);
  });

  /**
   * 结束窗口拖动，并短暂屏蔽拖动后的模型点击命中。
   */
  const handlePointerRelease = useEffectEvent((event: React.PointerEvent<HTMLDivElement>): void => {
    const dragState = dragStateRef.current;

    if (!dragState || dragState.pointerId !== event.pointerId) {
      return;
    }

    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }

    if (dragState.hasMoved) {
      suppressHitUntilRef.current = Date.now() + 180;
    }

    dragStateRef.current = null;
    setIsDragging(false);
  });

  useEffect(() => {
    const host = hostRef.current;

    if (!host) {
      return;
    }

    let disposed = false;
    let resizeObserver: ResizeObserver | null = null;
    let pixiApp: PIXI.Application | null = null;

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

      const model = await Live2DModel.from(window.lumina.getLive2DModelUrl(MODEL_ENTRY_PATH), {
        autoUpdate: true,
        autoHitTest: true,
        autoFocus: true,
        ticker: app.ticker
      });

      if (disposed) {
        app.destroy(true, { children: true, texture: true, textureSource: true, context: true });
        return;
      }

      // 该库在 Pixi v8 + Electron 下对 renderer 的自动探测不稳定，这里直接绑定当前舞台 renderer。
      const unsafeModel = model as any;
      unsafeModel.renderer = rendererWithGl;
      model.eventMode = "static";
      model.cursor = "grab";
      app.stage.addChild(model);
      app.render();
      fitModelWhenReady(model, host);

      // 模型目录里已经定义了 Idle 分组，加载后立即进入站立待机状态。
      void model.motion("Idle");

      model.on("hit", (hitAreas: string[]) => {
        if (Date.now() < suppressHitUntilRef.current) {
          return;
        }

        const hitAreaName = hitAreas[0];

        if (!hitAreaName) {
          return;
        }

        void model.motion(toTapMotionGroup(hitAreaName));
      });

      resizeObserver = new ResizeObserver(() => {
        fitModelToStage(model, host);
      });
      resizeObserver.observe(host);
    })().catch((error: unknown) => {
      const message = error instanceof Error ? error.message : String(error);
      setErrorText(`加载失败：${message}`);
    });

    return () => {
      disposed = true;
      resizeObserver?.disconnect();
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
      {errorText ? <div className="stage-overlay is-error">{errorText}</div> : null}
    </div>
  );
}
