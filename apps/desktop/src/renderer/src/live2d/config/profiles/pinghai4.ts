import type { Live2DModelProfile } from "../../types";

/**
 * 内置模型 `pinghai_4` 的运行时 profile。
 *
 * 这份 profile 作为第二个内置模型入口，优先选择最保守的动作策略：
 * - 头部固定 `touch_head`
 * - 身体固定 `touch_body`
 * - 特殊区域固定 `touch_special`
 *
 * 这样即便后续没有额外适配，也能避免把整组循环状态动作直接暴露给点击交互。
 */
export const pinghai4Profile: Live2DModelProfile = {
  displayName: "Pinghai 4",
  entryPath: "AzueLane/pinghai_4/pinghai_4.model3.json",
  id: "pinghai_4",
  idle: {
    group: "Idle",
    priority: 1
  },
  interactions: {
    hitAreaActions: {
      TouchBody: {
        holdMs: 1200,
        kind: "motion",
        lockInput: true,
        resumeIdle: true,
        selector: {
          fallbackIndex: 0,
          file: "motions/touch_body.motion3.json",
          group: "TapTouchBody",
          selection: "file"
        }
      },
      TouchHead: {
        accent: {
          durationMs: 420,
          kind: "headTap"
        },
        holdMs: 1200,
        kind: "motion",
        lockInput: true,
        resumeIdle: true,
        selector: {
          fallbackIndex: 0,
          file: "motions/touch_head.motion3.json",
          group: "TapTouchHead",
          selection: "file"
        }
      },
      TouchSpecial: {
        holdMs: 1200,
        kind: "motion",
        lockInput: true,
        resumeIdle: true,
        selector: {
          fallbackIndex: 0,
          file: "motions/touch_special.motion3.json",
          group: "TapTouchSpecial",
          selection: "file"
        }
      }
    }
  },
  placement: {
    boundsTrimRatio: 0.01,
    centerOffsetX: 0,
    scaleBoost: 1.04
  }
};
