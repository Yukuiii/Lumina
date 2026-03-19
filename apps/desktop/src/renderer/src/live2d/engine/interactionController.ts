import { resolveInteractionPlan } from "./interactionResolver";
import type {
  Live2DInteractionController,
  Live2DModelProfile,
  Live2DSession,
  ResolvedInteractionPlan
} from "../types";

type CreateLive2DInteractionControllerOptions = {
  onError: (message: string) => void;
  profile: Live2DModelProfile;
  session: Live2DSession;
  shouldSuppressHit: () => boolean;
};

/**
 * 创建一份基于会话层的交互控制器。
 *
 * controller 层负责更高一层的交互编排：
 * - 监听命中区域
 * - 解析 profile 里的动作策略
 * - 处理输入锁
 * - 处理 hold timer 与回 Idle
 * - 统一动作执行失败的报错出口
 *
 * @param options 创建控制器所需的会话、profile 与错误处理器。
 * @returns 可在组件卸载时显式销毁的控制器实例。
 */
export function createLive2DInteractionController(
  options: CreateLive2DInteractionControllerOptions
): Live2DInteractionController {
  const { onError, profile, session, shouldSuppressHit } = options;
  let destroyed = false;
  let interactionLocked = false;
  let interactionHoldTimerId: number | null = null;

  /**
   * 清理当前交互锁对应的定时器。
   */
  const clearInteractionHoldTimer = (): void => {
    if (interactionHoldTimerId === null) {
      return;
    }

    window.clearTimeout(interactionHoldTimerId);
    interactionHoldTimerId = null;
  };

  /**
   * 解除输入锁。
   */
  const unlockInteraction = (): void => {
    interactionLocked = false;
  };

  /**
   * 强制停止当前 motion，并切回 profile 定义的 Idle。
   *
   * 这一步是当前 Live2D renderer 的统一安全补丁：
   * 对于循环点击动作，controller 必须在固定时机收口回待机状态，
   * 否则模型可能长期停留在某个状态 motion 上。
   */
  const resumeIdleMotion = (): void => {
    clearInteractionHoldTimer();
    unlockInteraction();
    session.stopAllMotions();
    void session.playIdle();
  };

  /**
   * 根据交互计划设置输入锁与自动回退策略。
   *
   * @param plan 已解析完成、准备执行的交互计划。
   */
  const scheduleInteractionRelease = (plan: ResolvedInteractionPlan): void => {
    if (!("lockInput" in plan) || !plan.lockInput) {
      return;
    }

    clearInteractionHoldTimer();
    interactionLocked = true;
    interactionHoldTimerId = window.setTimeout(() => {
      if (destroyed) {
        return;
      }

      if (plan.kind === "motion" && plan.resumeIdle) {
        resumeIdleMotion();
        return;
      }

      clearInteractionHoldTimer();
      unlockInteraction();
    }, plan.holdMs);
  };

  /**
   * 执行一次已经解析好的交互计划。
   *
   * @param plan 命中区域对应的运行时执行计划。
   */
  const executeInteractionPlan = (plan: ResolvedInteractionPlan): void => {
    if (plan.kind === "ignore") {
      return;
    }

    if ("lockInput" in plan && plan.lockInput) {
      interactionLocked = true;
    }

    if (plan.kind === "accent-only") {
      scheduleInteractionRelease(plan);
      session.playPlacementAccent(plan.accent);
      console.info("[Live2D]", plan.label);
      return;
    }

    void Promise.resolve(session.playMotion(plan.motionGroup, plan.motionIndex))
      .then((started) => {
        if (destroyed) {
          return;
        }

        if (!started) {
          unlockInteraction();
          return;
        }

        scheduleInteractionRelease(plan);

        if (plan.accent) {
          session.playPlacementAccent(plan.accent);
        }

        console.info("[Live2D]", plan.label);
      })
      .catch((error: unknown) => {
        unlockInteraction();
        const message = error instanceof Error ? error.message : String(error);
        onError(`动作触发失败：${message}`);
      });
  };

  /**
   * 处理模型命中结果。
   *
   * @param hitAreas 模型命中的区域名列表。
   */
  const handleHitAreas = (hitAreas: string[]): void => {
    if (destroyed || shouldSuppressHit() || interactionLocked) {
      return;
    }

    const hitAreaName = hitAreas[0];

    if (!hitAreaName) {
      return;
    }

    const plan = resolveInteractionPlan(profile, hitAreaName, session.model);

    if (!plan) {
      return;
    }

    executeInteractionPlan(plan);
  };

  /**
   * 响应 motion 自然结束事件。
   *
   * 对于非循环或被库内部正常结束的动作，这里负责兜底清掉输入锁。
   */
  const handleMotionFinish = (): void => {
    clearInteractionHoldTimer();
    unlockInteraction();
  };

  const releaseHitSubscription = session.onHit(handleHitAreas);
  const releaseMotionFinishSubscription = session.onMotionFinish(handleMotionFinish);

  return {
    destroy(): void {
      if (destroyed) {
        return;
      }

      destroyed = true;
      clearInteractionHoldTimer();
      unlockInteraction();
      releaseHitSubscription();
      releaseMotionFinishSubscription();
    }
  };
}
