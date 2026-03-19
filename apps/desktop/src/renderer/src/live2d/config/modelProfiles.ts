import { aierdeliqi5Profile } from "./profiles/aierdeliqi5";

/**
 * 当前渲染层内置的 Live2D 模型 profile 列表。
 *
 * 后续新增模型时，只需要在这里注册新的 profile，
 * `Live2DStage` 不应再增加新的硬编码分支。
 */
export const LIVE2D_MODEL_PROFILES = [aierdeliqi5Profile] as const;

/**
 * 当前桌宠默认使用的模型 profile。
 */
export const DEFAULT_LIVE2D_MODEL_PROFILE = aierdeliqi5Profile;
