import React from "react";
import { Live2DStage } from "../live2d/Live2DStage";

/**
 * 从当前地址栏 query 中解析模型切换参数。
 *
 * 当前先提供一个零 UI 的模型切换入口：
 * - `?model=aierdeliqi_5`
 * - `?model=pinghai_4`
 *
 * 后续若接入设置面板或持久化配置，可以把该逻辑上移，
 * 但 `Live2DStage` 仍只接收明确的 `modelId`。
 *
 * @returns 当前请求的模型 id；若未传则返回 `undefined`。
 */
function getRequestedModelId(): string | undefined {
  const modelId = new URLSearchParams(window.location.search).get("model");

  if (modelId) {
    return modelId.trim() || undefined;
  }

  const envModelId = import.meta.env.VITE_LIVE2D_MODEL_ID;

  if (typeof envModelId === "string") {
    return envModelId.trim() || undefined;
  }

  return undefined;
}

/**
 * 桌宠渲染进程 UI，只负责显示透明窗口中的 Live2D 模型。
 */
export function App(): React.JSX.Element {
  return (
    <div className="app">
      <Live2DStage modelId={getRequestedModelId()} />
    </div>
  );
}
