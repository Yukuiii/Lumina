import type { Application, Renderer } from "pixi.js";

/**
 * `model3.json` 中 motion 定义的最小公共结构。
 *
 * 当前只依赖 `File` 字段来做动作文件匹配，后续若要扩展音频、淡入淡出等策略，
 * 可以在这里继续补充字段而不需要回头改解析器接口。
 */
export type MotionDefinition = {
  File?: string;
};

/**
 * 模型在舞台中的基础摆放结果。
 *
 * 这是“没有任何点击 accent 干预时”的稳定位置。
 * 所有外部位移、缩放、旋转动画都应当基于这份数据叠加，而不是直接写死绝对值。
 */
export type ModelPlacement = {
  rotation: number;
  scale: number;
  x: number;
  y: number;
};

/**
 * 叠加在基础摆放之上的轻量外部动画偏移。
 *
 * 这里不直接操作 Live2D 参数，而是通过 Pixi 容器层做安全补间，
 * 以规避模型自带循环 motion 残留状态的问题。
 */
export type ModelPlacementAccent = {
  offsetX: number;
  offsetY: number;
  rotation: number;
  scaleMultiplier: number;
};

/**
 * 窗口拖拽期间需要持续记录的指针状态。
 *
 * 该状态只服务于桌宠窗口拖动，不参与模型内部动作逻辑。
 */
export type DragState = {
  pointerId: number;
  startScreenX: number;
  startScreenY: number;
  lastScreenX: number;
  lastScreenY: number;
  hasMoved: boolean;
};

/**
 * 渲染进程额外挂在 `window` 上的 Live2D / Pixi 运行时句柄。
 *
 * 这些字段主要用于调试和一次性资源缓存，不应当作为业务层稳定 API。
 */
export type Live2DWindow = Window & {
  PIXI?: typeof import("pixi.js");
  Live2DCubismCore?: unknown;
  app?: Application;
};

/**
 * 兼容 Pixi v8 / Electron 下 WebGL 上下文读取的 renderer 类型。
 */
export type RendererWithGl = Renderer & {
  gl?: WebGLRenderingContext | WebGL2RenderingContext;
};

/**
 * 可配置的外部安全 accent 类型。
 *
 * 这些 accent 全部作用于 Pixi 容器层，不会修改模型内部参数或部件透明度。
 */
export type PlacementAccentSpec =
  | {
      durationMs: number;
      kind: "headTap";
    }
  | {
      durationMs: number;
      kind: "catPawTap";
    };

/**
 * 动作分组的来源。
 *
 * - `group`: 直接使用显式 group 名称
 * - `groupFromHitArea`: 运行时根据命中区域名拼出 group，例如 `TouchHead -> TapTouchHead`
 */
type MotionSelectorGroup =
  | {
      group: string;
      groupFromHitArea?: never;
      groupPrefix?: never;
    }
  | {
      group?: never;
      groupFromHitArea: true;
      groupPrefix?: string;
    };

/**
 * 动作选择策略。
 *
 * 设计目标：
 * - 能直接按 index 选动作
 * - 能按文件名稳定匹配动作，避免资源顺序变化时行为漂移
 * - 能保留“随机从某个组里选一个”的默认能力
 */
export type MotionSelector =
  | (MotionSelectorGroup & {
      selection: "index";
      index: number;
    })
  | (MotionSelectorGroup & {
      fallbackIndex?: number;
      file: string;
      selection: "file";
    })
  | (MotionSelectorGroup & {
      selection: "random";
    });

/**
 * 需要实际调用模型 motion 的交互行为。
 */
export type MotionInteractionAction = {
  accent?: PlacementAccentSpec;
  debugLabel?: string;
  holdMs: number;
  kind: "motion";
  lockInput: boolean;
  resumeIdle: boolean;
  selector: MotionSelector;
};

/**
 * 仅播放外部安全 accent、不触发模型内部 motion 的交互行为。
 *
 * 适用于模型自带动作存在残留状态、循环特效或不可恢复问题的命中区域。
 */
export type AccentOnlyInteractionAction = {
  accent: PlacementAccentSpec;
  debugLabel?: string;
  holdMs: number;
  kind: "accent-only";
  lockInput: boolean;
};

/**
 * 显式禁用某个命中区域的交互行为。
 */
export type IgnoreInteractionAction = {
  debugLabel?: string;
  kind: "ignore";
};

/**
 * 单个命中区域可配置的交互描述。
 */
export type InteractionAction = MotionInteractionAction | AccentOnlyInteractionAction | IgnoreInteractionAction;

/**
 * 模型摆放相关的可配置参数。
 */
export type Live2DPlacementConfig = {
  boundsTrimRatio: number;
  centerOffsetX: number;
  scaleBoost: number;
};

/**
 * 模型待机 motion 的配置。
 */
export type Live2DIdleConfig = {
  group: string;
  priority: number;
};

/**
 * 模型交互配置。
 *
 * `defaultTapAction` 用作兜底策略，允许未来新模型只声明少量特例，
 * 其余命中区域走默认行为。
 */
export type Live2DInteractionConfig = {
  defaultTapAction?: MotionInteractionAction | IgnoreInteractionAction;
  hitAreaActions: Partial<Record<string, InteractionAction>>;
};

/**
 * 单个 Live2D 模型的完整运行时 profile。
 *
 * 这是后续扩展多模型时的核心配置入口：
 * - 模型资源路径
 * - 摆放参数
 * - 待机策略
 * - 命中区域交互
 */
export type Live2DModelProfile = {
  entryPath: string;
  id: string;
  idle: Live2DIdleConfig;
  interactions: Live2DInteractionConfig;
  placement: Live2DPlacementConfig;
};

/**
 * 运行时解析后的 motion 执行计划。
 *
 * 该结构已经把“配置层描述”转换为“可以直接执行”的 group / index。
 */
export type ResolvedMotionInteractionPlan = {
  accent?: PlacementAccentSpec;
  holdMs: number;
  kind: "motion";
  label: string;
  lockInput: boolean;
  motionGroup: string;
  motionIndex?: number;
  resumeIdle: boolean;
};

/**
 * 运行时解析后的 accent-only 执行计划。
 */
export type ResolvedAccentOnlyInteractionPlan = {
  accent: PlacementAccentSpec;
  holdMs: number;
  kind: "accent-only";
  label: string;
  lockInput: boolean;
};

/**
 * 运行时解析后的忽略计划。
 */
export type ResolvedIgnoreInteractionPlan = {
  kind: "ignore";
  label: string;
};

/**
 * 命中区域在解析完成后可执行的计划联合类型。
 */
export type ResolvedInteractionPlan =
  | ResolvedMotionInteractionPlan
  | ResolvedAccentOnlyInteractionPlan
  | ResolvedIgnoreInteractionPlan;
