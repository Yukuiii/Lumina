import React, { useEffectEvent, useRef, useState } from "react";

import type { DragState } from "../types";

const DRAG_START_DISTANCE_PX = 6;
const POST_DRAG_HIT_SUPPRESSION_MS = 180;

/**
 * 绑定桌宠窗口拖动所需的指针处理逻辑。
 *
 * 该 hook 只负责“窗口拖动”这一类交互：
 * - 达到位移阈值后才真正进入拖动状态
 * - 拖动结束后短暂屏蔽模型点击，避免把拖动误判成命中动作
 *
 * @returns 供舞台根容器直接挂载的拖动事件处理器与状态。
 */
export function useDesktopPetDrag(): {
  handlePointerDown: (event: React.PointerEvent<HTMLDivElement>) => void;
  handlePointerMove: (event: React.PointerEvent<HTMLDivElement>) => void;
  handlePointerRelease: (event: React.PointerEvent<HTMLDivElement>) => void;
  isDragging: boolean;
  shouldSuppressHit: () => boolean;
} {
  const dragStateRef = useRef<DragState | null>(null);
  const suppressHitUntilRef = useRef<number>(0);
  const [isDragging, setIsDragging] = useState<boolean>(false);

  /**
   * 判断当前时刻是否应当暂时屏蔽模型命中。
   *
   * @returns `true` 表示仍处于拖动后的短暂保护窗口内。
   */
  const shouldSuppressHit = useEffectEvent((): boolean => {
    return Date.now() < suppressHitUntilRef.current;
  });

  /**
   * 开始记录拖动所需的初始指针状态。
   *
   * @param event React PointerEvent。
   */
  const handlePointerDown = useEffectEvent((event: React.PointerEvent<HTMLDivElement>): void => {
    if (event.button !== 0) {
      return;
    }

    dragStateRef.current = {
      hasMoved: false,
      lastScreenX: event.screenX,
      lastScreenY: event.screenY,
      pointerId: event.pointerId,
      startScreenX: event.screenX,
      startScreenY: event.screenY
    };
  });

  /**
   * 当位移超过阈值后拖动 Electron 桌宠窗口。
   *
   * @param event React PointerEvent。
   */
  const handlePointerMove = useEffectEvent((event: React.PointerEvent<HTMLDivElement>): void => {
    const dragState = dragStateRef.current;

    if (!dragState || dragState.pointerId !== event.pointerId) {
      return;
    }

    const totalDeltaX = event.screenX - dragState.startScreenX;
    const totalDeltaY = event.screenY - dragState.startScreenY;
    const stepDeltaX = event.screenX - dragState.lastScreenX;
    const stepDeltaY = event.screenY - dragState.lastScreenY;

    if (!dragState.hasMoved) {
      if (Math.hypot(totalDeltaX, totalDeltaY) < DRAG_START_DISTANCE_PX) {
        return;
      }

      event.currentTarget.setPointerCapture(event.pointerId);
      dragState.hasMoved = true;
      setIsDragging(true);
    }

    if (!stepDeltaX && !stepDeltaY) {
      return;
    }

    dragState.lastScreenX = event.screenX;
    dragState.lastScreenY = event.screenY;
    window.lumina.dragWindowBy(stepDeltaX, stepDeltaY);
  });

  /**
   * 结束拖动，并启动一次短暂的点击保护窗口。
   *
   * @param event React PointerEvent。
   */
  const handlePointerRelease = useEffectEvent((event: React.PointerEvent<HTMLDivElement>): void => {
    const dragState = dragStateRef.current;

    if (!dragState || dragState.pointerId !== event.pointerId) {
      return;
    }

    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }

    if (dragState.hasMoved) {
      suppressHitUntilRef.current = Date.now() + POST_DRAG_HIT_SUPPRESSION_MS;
    }

    dragStateRef.current = null;
    setIsDragging(false);
  });

  return {
    handlePointerDown,
    handlePointerMove,
    handlePointerRelease,
    isDragging,
    shouldSuppressHit
  };
}
