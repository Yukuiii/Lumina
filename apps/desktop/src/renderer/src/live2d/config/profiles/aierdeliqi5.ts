import type { Live2DModelProfile } from "../../types";

/**
 * 默认桌宠模型 `aierdeliqi_5` 的运行时 profile。
 *
 * 设计原则：
 * - 保留模型原始资源路径与舞台摆放参数
 * - 将命中区域交互从组件中拿出来
 * - 对已经验证不稳定的区域采用显式覆盖，而不是继续在组件里写 if / else
 */
export const aierdeliqi5Profile: Live2DModelProfile = {
  displayName: "Aierdeliqi 5",
  entryPath: "AzueLane/aierdeliqi_5/aierdeliqi_5.model3.json",
  id: "aierdeliqi_5",
  idle: {
    group: "Idle",
    priority: 1
  },
  interactions: {
    defaultTapAction: {
      holdMs: 1200,
      kind: "motion",
      lockInput: true,
      resumeIdle: true,
      selector: {
        groupFromHitArea: true,
        selection: "random"
      }
    },
    hitAreaActions: {
      /**
       * 头部命中只允许走专用 `touch_head`。
       *
       * 原始 `TapTouchHead` 组里的大部分动作都是循环状态动作，
       * 会把模型留在异常视觉状态，因此这里固定按文件名匹配。
       */
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
          fallbackIndex: 10,
          file: "motions/touch_head.motion3.json",
          group: "TapTouchHead",
          selection: "file"
        }
      },
      /**
       * 身侧区域仍允许走模型自带的 `TapTouchSpecial`。
       */
      TouchSpecial: {
        holdMs: 1200,
        kind: "motion",
        lockInput: true,
        resumeIdle: true,
        selector: {
          group: "TapTouchSpecial",
          selection: "random"
        }
      },
      /**
       * 左下角猫爪区域不再触发 `login.motion3.json`。
       *
       * 该动作会把场景特效层和遮罩层长期保持开启，Idle 无法恢复，
       * 因此这里完全降级为外部安全 accent。
       */
      cat3_frontleg_r: {
        accent: {
          durationMs: 520,
          kind: "catPawTap"
        },
        debugLabel: "Tapcat3_frontleg_r[safe-accent]",
        holdMs: 520,
        kind: "accent-only",
        lockInput: true
      }
    }
  },
  placement: {
    boundsTrimRatio: 0.01,
    centerOffsetX: -14,
    scaleBoost: 1.06
  }
};
