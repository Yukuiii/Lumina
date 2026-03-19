import type { Live2DModel as Live2DModelType } from "@jannchie/pixi-live2d-display/cubism4";

import type {
  InteractionAction,
  Live2DModelProfile,
  MotionDefinition,
  MotionInteractionAction,
  MotionSelector,
  ResolvedInteractionPlan
} from "../types";

const DEFAULT_TAP_GROUP_PREFIX = "Tap";

/**
 * 获取某个 motion group 的定义列表。
 *
 * @param model 已加载的 Live2D 模型实例。
 * @param motionGroup motion 分组名称。
 * @returns 对应分组的动作定义；若不存在则返回空数组。
 */
export function getMotionDefinitions(model: Live2DModelType, motionGroup: string): MotionDefinition[] {
  const definitions = model.internalModel?.motionManager.definitions[motionGroup];

  return Array.isArray(definitions) ? definitions : [];
}

/**
 * 根据模型 profile 与命中区域，解析出可直接执行的交互计划。
 *
 * 这是配置层与运行时执行层之间的边界：
 * - profile 只描述“应该怎么做”
 * - resolver 负责把描述转换成 group / index / label
 *
 * @param profile 当前模型 profile。
 * @param hitAreaName 运行时命中的区域名。
 * @param model 已加载的 Live2D 模型实例。
 * @returns 可直接执行的交互计划；若 profile 未声明任何策略，则返回 `null`。
 */
export function resolveInteractionPlan(
  profile: Live2DModelProfile,
  hitAreaName: string,
  model: Live2DModelType
): ResolvedInteractionPlan | null {
  const action = profile.interactions.hitAreaActions[hitAreaName] ?? profile.interactions.defaultTapAction;

  if (!action) {
    return null;
  }

  return toResolvedInteractionPlan(action, hitAreaName, model);
}

/**
 * 将交互配置转换为具体执行计划。
 *
 * @param action 需要解析的交互配置。
 * @param hitAreaName 运行时命中的区域名。
 * @param model 已加载的 Live2D 模型实例。
 * @returns 运行时可直接执行的计划。
 */
function toResolvedInteractionPlan(
  action: InteractionAction,
  hitAreaName: string,
  model: Live2DModelType
): ResolvedInteractionPlan {
  if (action.kind === "ignore") {
    return {
      kind: "ignore",
      label: action.debugLabel ?? `${hitAreaName}[ignored]`
    };
  }

  if (action.kind === "accent-only") {
    return {
      accent: action.accent,
      holdMs: action.holdMs,
      kind: "accent-only",
      label: action.debugLabel ?? `${hitAreaName}[accent-only]`,
      lockInput: action.lockInput
    };
  }

  return resolveMotionInteractionPlan(action, hitAreaName, model);
}

/**
 * 解析 motion 类型交互配置。
 *
 * @param action motion 行为配置。
 * @param hitAreaName 运行时命中的区域名。
 * @param model 已加载的 Live2D 模型实例。
 * @returns 解析后的 motion 执行计划。
 */
function resolveMotionInteractionPlan(
  action: MotionInteractionAction,
  hitAreaName: string,
  model: Live2DModelType
): ResolvedInteractionPlan {
  const motionGroup = resolveMotionGroup(action.selector, hitAreaName);
  const motionDefinitions = getMotionDefinitions(model, motionGroup);
  const motionIndex = resolveMotionIndex(action.selector, motionDefinitions);
  const motionFile = motionIndex === undefined ? undefined : motionDefinitions[motionIndex]?.File;

  return {
    accent: action.accent,
    holdMs: action.holdMs,
    kind: "motion",
    label: action.debugLabel ?? formatMotionLabel(motionGroup, motionIndex, motionFile),
    lockInput: action.lockInput,
    motionGroup,
    motionIndex,
    resumeIdle: action.resumeIdle
  };
}

/**
 * 根据 selector 解析最终使用的 motion group。
 *
 * @param selector motion 选择策略。
 * @param hitAreaName 运行时命中的区域名。
 * @returns 解析后的 motion group。
 */
function resolveMotionGroup(selector: MotionSelector, hitAreaName: string): string {
  if (!selector.groupFromHitArea) {
    return selector.group;
  }

  return `${selector.groupPrefix ?? DEFAULT_TAP_GROUP_PREFIX}${hitAreaName}`;
}

/**
 * 根据 selector 与动作定义列表解析最终 index。
 *
 * @param selector motion 选择策略。
 * @param motionDefinitions 当前分组下的动作定义列表。
 * @returns 应当传给 `model.motion()` 的 index；若应随机播放则返回 `undefined`。
 */
function resolveMotionIndex(selector: MotionSelector, motionDefinitions: MotionDefinition[]): number | undefined {
  switch (selector.selection) {
    case "file": {
      const matchedIndex = motionDefinitions.findIndex((definition) => definition.File === selector.file);

      if (matchedIndex >= 0) {
        return matchedIndex;
      }

      if (selector.fallbackIndex !== undefined) {
        return clampMotionIndex(selector.fallbackIndex, motionDefinitions.length);
      }

      return motionDefinitions.length ? 0 : undefined;
    }
    case "index":
      return clampMotionIndex(selector.index, motionDefinitions.length);
    case "random":
      return undefined;
  }
}

/**
 * 生成用户可读的动作标签。
 *
 * @param motionGroup motion 分组名称。
 * @param motionIndex 解析后的动作索引；若为 `undefined` 表示随机播放。
 * @param motionFile 解析出的动作文件名。
 * @returns 适合显示在调试 overlay 中的文本。
 */
function formatMotionLabel(motionGroup: string, motionIndex: number | undefined, motionFile?: string): string {
  if (motionIndex === undefined) {
    return `${motionGroup}[random]`;
  }

  return `${motionGroup}[${motionIndex}] ${motionFile ?? "unknown"}`;
}

/**
 * 将索引限制在当前动作定义列表范围内。
 *
 * @param motionIndex 原始索引。
 * @param motionCount 当前分组动作数量。
 * @returns 限制后的安全索引；若分组为空则回退为 `0`。
 */
function clampMotionIndex(motionIndex: number, motionCount: number): number {
  if (!motionCount) {
    return 0;
  }

  return Math.min(Math.max(motionIndex, 0), motionCount - 1);
}
