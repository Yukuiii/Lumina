import type { Live2DModel as Live2DModelType } from "@jannchie/pixi-live2d-display/cubism4";

import type { Live2DPlacementConfig, ModelPlacement, ModelPlacementAccent } from "../types";

const DEFAULT_PLACEMENT_ACCENT: ModelPlacementAccent = {
  offsetX: 0,
  offsetY: 0,
  rotation: 0,
  scaleMultiplier: 1
};

/**
 * 计算模型所有 drawable 顶点的包围盒。
 *
 * 当模型资源里存在异常远离主体的顶点时，`trimRatio` 可以裁掉少量离群点，
 * 避免整个模型被错误压缩得过小。
 *
 * @param model 已完成加载的 Live2D 模型实例。
 * @param trimRatio 离群点裁剪比例，取值范围建议在 `0 ~ 0.05`。
 * @returns 可用于舞台摆放的包围盒；若当前还拿不到可用顶点数据，则返回 `null`。
 */
export function getDrawableBounds(
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
 * 将基础摆放结果与外部 accent 合成后写回模型容器。
 *
 * @param model 已加载的 Live2D 模型实例。
 * @param placement 模型的基础摆放值。
 * @param accent 需要叠加的外部轻量动画偏移；未传时使用零偏移。
 */
export function applyModelPlacement(
  model: Live2DModelType,
  placement: ModelPlacement,
  accent: ModelPlacementAccent = DEFAULT_PLACEMENT_ACCENT
): void {
  model.scale.set(placement.scale * accent.scaleMultiplier);
  model.x = placement.x + accent.offsetX;
  model.y = placement.y + accent.offsetY;
  model.rotation = placement.rotation + accent.rotation;
}

/**
 * 根据当前宿主容器尺寸重新计算模型的基础摆放。
 *
 * @param model 已加载的 Live2D 模型实例。
 * @param host 承载 Pixi canvas 的 DOM 容器。
 * @param config 当前模型 profile 的摆放配置。
 * @returns 计算得到的基础摆放结果；若尺寸或包围盒不可用则返回 `null`。
 */
export function fitModelToStage(
  model: Live2DModelType,
  host: HTMLElement,
  config: Live2DPlacementConfig
): ModelPlacement | null {
  const stageWidth = host.clientWidth;
  const stageHeight = host.clientHeight;
  const drawableBounds = getDrawableBounds(model, config.boundsTrimRatio) ?? getDrawableBounds(model);

  if (!stageWidth || !stageHeight || !drawableBounds || !drawableBounds.width || !drawableBounds.height) {
    return null;
  }

  const fitScale = Math.min((stageWidth * 0.84) / drawableBounds.width, (stageHeight * 0.92) / drawableBounds.height);
  const scale = fitScale * config.scaleBoost;
  const placement = {
    rotation: 0,
    scale,
    x: stageWidth / 2 - (drawableBounds.x + drawableBounds.width / 2) * scale + config.centerOffsetX,
    y: stageHeight / 2 - (drawableBounds.y + drawableBounds.height / 2) * scale
  };

  applyModelPlacement(model, placement);
  return placement;
}

/**
 * 在模型首次加载阶段持续尝试摆放，直到拿到稳定尺寸。
 *
 * 某些模型在刚创建完成时还无法立刻给出可用 `bounds` / `logical size`，
 * 如果此时直接停止，模型会短暂极小甚至近似不可见。
 *
 * @param model 已加载的 Live2D 模型实例。
 * @param host 承载 Pixi canvas 的 DOM 容器。
 * @param config 当前模型 profile 的摆放配置。
 * @param onPlacementChange 每次成功算出摆放时触发，可用来缓存基础 placement。
 * @param retries 剩余重试次数，默认 12 帧。
 */
export function fitModelWhenReady(
  model: Live2DModelType,
  host: HTMLElement,
  config: Live2DPlacementConfig,
  onPlacementChange?: (placement: ModelPlacement | null) => void,
  retries = 12
): void {
  const placement = fitModelToStage(model, host, config);
  onPlacementChange?.(placement);

  const hasLogicalSize = Boolean(model.internalModel?.width && model.internalModel?.height);
  const bounds = model.getLocalBounds();
  const hasBounds = Boolean(bounds.width && bounds.height);

  if ((hasLogicalSize || hasBounds) || retries <= 0) {
    return;
  }

  window.requestAnimationFrame(() => {
    fitModelWhenReady(model, host, config, onPlacementChange, retries - 1);
  });
}
