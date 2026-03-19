import React, { useEffect, useState } from "react";
import type { ConnectionStatus } from "../hooks/useGatewaySocket";

const CONNECTED_FADE_DELAY_MS = 3000;

/**
 * 连接状态指示器参数。
 */
type ConnectionDotProps = {
  /** 当前连接状态。 */
  status: ConnectionStatus;
};

/**
 * 右上角连接状态圆点。
 *
 * - 🟢 `connected`：3 秒后自动淡出
 * - 🟡 `connecting` / `disconnected`：脉冲动画
 * - 🔴 `failed`：常驻显示
 */
export function ConnectionDot(props: ConnectionDotProps): React.JSX.Element {
  const { status } = props;
  const [isHidden, setIsHidden] = useState(false);

  useEffect(() => {
    setIsHidden(false);

    if (status !== "connected") {
      return;
    }

    const timer = window.setTimeout(() => {
      setIsHidden(true);
    }, CONNECTED_FADE_DELAY_MS);

    return () => {
      window.clearTimeout(timer);
    };
  }, [status]);

  const statusClass = (() => {
    switch (status) {
      case "connected":
        return "is-connected";
      case "connecting":
      case "disconnected":
        return "is-connecting";
      case "failed":
        return "is-failed";
      default:
        return "";
    }
  })();

  return (
    <div className={`connection-dot ${statusClass}${isHidden ? " is-hidden" : ""}`} />
  );
}
