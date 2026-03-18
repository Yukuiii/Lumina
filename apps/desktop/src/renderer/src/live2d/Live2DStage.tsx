import React, { useEffect, useEffectEvent, useRef, useState } from "react";
import * as PIXI from "pixi.js";
import type { Live2DModel as Live2DModelType } from "@jannchie/pixi-live2d-display/cubism4";

const MODEL_ENTRY_PATH = "AzueLane/aierdeliqi_5/aierdeliqi_5.model3.json";
const MODEL_SCALE_BOOST = 1.15;

type Live2DStageProps = {
  onLog?: (line: string) => void;
};

type Live2DWindow = Window & {
  PIXI?: typeof PIXI;
  Live2DCubismCore?: unknown;
  app?: PIXI.Application;
};

type RendererWithGl = PIXI.Renderer & {
  gl?: WebGLRenderingContext | WebGL2RenderingContext;
};

type StageStatus = {
  isError: boolean;
  text: string;
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
  const drawableBounds = getDrawableBounds(model, 0.02) ?? getDrawableBounds(model);

  if (!stageWidth || !stageHeight || !drawableBounds || !drawableBounds.width || !drawableBounds.height) {
    return;
  }

  const fitScale = Math.min((stageWidth * 0.9) / drawableBounds.width, (stageHeight * 0.96) / drawableBounds.height);
  // 让模型尽量占满舞台主体区域，同时保留少量安全边距避免被裁切。
  const scale = fitScale * MODEL_SCALE_BOOST;

  model.scale.set(scale);
  model.x = stageWidth / 2 - (drawableBounds.x + drawableBounds.width / 2) * scale;
  model.y = stageHeight - 4 - (drawableBounds.y + drawableBounds.height) * scale;
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
export function Live2DStage({ onLog }: Live2DStageProps): React.JSX.Element {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const [status, setStatus] = useState<StageStatus>({
    isError: false,
    text: "准备加载模型"
  });

  /**
   * 记录舞台内部日志。
   */
  const log = useEffectEvent((line: string): void => {
    onLog?.(line);
  });

  /**
   * 更新舞台顶部状态提示。
   */
  const updateStatus = useEffectEvent((text: string, isError = false): void => {
    setStatus({ text, isError });
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
      updateStatus("加载 Cubism Core");
      await ensureCubismCoreLoaded(window.lumina.getLive2DCoreScriptUrl());

      if (disposed) {
        return;
      }

      updateStatus("初始化 Pixi 舞台");
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
      log(`[live2d] renderer: ${app.renderer.constructor.name}`);
      const rendererWithGl = app.renderer as RendererWithGl;
      log(
        `[live2d] gl: ${rendererWithGl.gl?.constructor?.name ?? "unknown"}, screen=${app.renderer.screen.width}x${app.renderer.screen.height}`
      );

      updateStatus("加载 Live2D 模型");
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
      model.cursor = "pointer";
      app.stage.addChild(model);
      app.render();
      fitModelWhenReady(model, host);

      // 模型目录里已经定义了 Idle 分组，加载后立即进入站立待机状态。
      void model.motion("Idle");

      model.on("hit", (hitAreas: string[]) => {
        const hitAreaName = hitAreas[0];

        if (!hitAreaName) {
          return;
        }

        log(`[live2d] hit: ${hitAreas.join(", ")}`);
        void model.motion(toTapMotionGroup(hitAreaName));
      });

      resizeObserver = new ResizeObserver(() => {
        fitModelToStage(model, host);
      });
      resizeObserver.observe(host);

      updateStatus("模型已就绪");
      const bounds = model.getLocalBounds();
      const rawDrawableBounds = getDrawableBounds(model);
      const stageDrawableBounds = getDrawableBounds(model, 0.02) ?? rawDrawableBounds;
      const textureSummary = model.textures
        .map(
          (texture, index) =>
            `${index}:${texture.width}x${texture.height}:source=${texture.source.width}x${texture.source.height}`
        )
        .join(", ");
      log(
        `[live2d] size: internal=${model.internalModel?.width ?? 0}x${model.internalModel?.height ?? 0}, bounds=${bounds.width.toFixed(2)}x${bounds.height.toFixed(2)}, rawDrawable=${rawDrawableBounds?.width.toFixed(2) ?? 0}x${rawDrawableBounds?.height.toFixed(2) ?? 0}, stageDrawable=${stageDrawableBounds?.width.toFixed(2) ?? 0}x${stageDrawableBounds?.height.toFixed(2) ?? 0}`
      );
      log(
        `[live2d] state: canRender=${String(model.canRender())}, validRenderer=${String(model.hasValidRenderer())}, visible=${String(model.visible)}, alpha=${model.alpha.toFixed(2)}`
      );
      log(`[live2d] textures: ${textureSummary}`);
      log(`[live2d] model ready: ${MODEL_ENTRY_PATH}`);
    })().catch((error: unknown) => {
      const message = error instanceof Error ? error.message : String(error);
      updateStatus(`加载失败：${message}`, true);
      log(`[live2d] load failed: ${message}`);
    });

    return () => {
      disposed = true;
      resizeObserver?.disconnect();
      pixiApp?.destroy(true, { children: true, texture: true, textureSource: true, context: true });
      host.replaceChildren();
    };
  }, []);

  return (
    <div className="stage-shell">
      <div ref={hostRef} className="stage-canvas" />
      <div className={`stage-overlay${status.isError ? " is-error" : ""}`}>{status.text}</div>
    </div>
  );
}
