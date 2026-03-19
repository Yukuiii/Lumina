import type { ModelPlacementAccent, PlacementAccentSpec } from "../types";

/**
 * 根据 accent 配置与动画进度生成对应的外部偏移。
 *
 * 所有返回值都作用于 Pixi 容器层，避免直接修改 Live2D 模型内部参数。
 *
 * @param accent 运行时要播放的安全 accent。
 * @param progress 动画进度，范围为 `0 ~ 1`。
 * @returns 当前进度下应施加的位移 / 缩放 / 旋转偏移。
 */
export function resolvePlacementAccent(accent: PlacementAccentSpec, progress: number): ModelPlacementAccent {
  switch (accent.kind) {
    case "catPawTap":
      return getCatPawTapPlacementAccent(progress);
    case "headTap":
      return getHeadTapPlacementAccent(progress);
  }
}

/**
 * 头部点击时的轻微点头 + 左右晃动补间。
 *
 * 这层动画只增强反馈，不承担模型状态切换职责，因此幅度保持较小。
 *
 * @param progress 动画进度，范围为 `0 ~ 1`。
 * @returns 当前进度下的外部偏移。
 */
function getHeadTapPlacementAccent(progress: number): ModelPlacementAccent {
  const envelope = Math.sin(progress * Math.PI);
  const sway = Math.sin(progress * Math.PI * 2);
  const rebound = Math.sin(progress * Math.PI * 3);

  return {
    offsetX: sway * 5 * envelope,
    offsetY: -12 * envelope + rebound * 3 * (1 - progress),
    rotation: sway * 0.035 * envelope,
    scaleMultiplier: 1 + 0.02 * envelope
  };
}

/**
 * 猫爪命中时的轻量弹跳补间。
 *
 * 该区域已经不再调用模型自带 `login.motion3.json`，
 * 因此需要由安全 accent 提供可感知的点击反馈。
 *
 * @param progress 动画进度，范围为 `0 ~ 1`。
 * @returns 当前进度下的外部偏移。
 */
function getCatPawTapPlacementAccent(progress: number): ModelPlacementAccent {
  const envelope = Math.sin(progress * Math.PI);
  const sway = Math.sin(progress * Math.PI * 1.5);
  const bob = Math.sin(progress * Math.PI * 2.5);

  return {
    offsetX: -10 * envelope + sway * 4,
    offsetY: -8 * envelope + bob * 4,
    rotation: -0.05 * envelope + sway * 0.015,
    scaleMultiplier: 1 - 0.015 * envelope
  };
}
