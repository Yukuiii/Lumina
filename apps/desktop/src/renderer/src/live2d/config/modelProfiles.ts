import { aierdeliqi5Profile } from "./profiles/aierdeliqi5";
import { pinghai4Profile } from "./profiles/pinghai4";
import type { Live2DModelProfile } from "../types";

/**
 * 当前渲染层内置的 Live2D 模型 profile 列表。
 *
 * 后续新增模型时，只需要在这里注册新的 profile，
 * `Live2DStage` 不应再增加新的硬编码分支。
 */
export const LIVE2D_MODEL_PROFILES = [aierdeliqi5Profile, pinghai4Profile] as const;

/**
 * 按 `id` 查询 profile 的映射表。
 *
 * 后续若接入设置页、query param、持久化配置，都应当经由这个映射表解析，
 * 而不是在组件层写新的 if / else。
 */
export const LIVE2D_MODEL_PROFILE_MAP = new Map<string, Live2DModelProfile>(
  LIVE2D_MODEL_PROFILES.map((profile) => [profile.id, profile])
);

/**
 * 当前桌宠默认使用的模型 id。
 */
export const DEFAULT_LIVE2D_MODEL_ID = aierdeliqi5Profile.id;

/**
 * 当前桌宠默认使用的模型 profile。
 */
export const DEFAULT_LIVE2D_MODEL_PROFILE = aierdeliqi5Profile;

/**
 * 根据 `modelId` 解析当前应当启用的 profile。
 *
 * @param modelId 外部传入的模型 id；未传或未命中时回退为默认模型。
 * @returns 可直接用于 renderer 的模型 profile。
 */
export function resolveLive2DModelProfile(modelId?: string): Live2DModelProfile {
  if (modelId) {
    const profile = LIVE2D_MODEL_PROFILE_MAP.get(modelId);

    if (profile) {
      return profile;
    }
  }

  return DEFAULT_LIVE2D_MODEL_PROFILE;
}
