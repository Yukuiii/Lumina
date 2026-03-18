import React from "react";
import { Live2DStage } from "../live2d/Live2DStage";

/**
 * 桌宠渲染进程 UI，只负责显示透明窗口中的 Live2D 模型。
 */
export function App(): React.JSX.Element {
  return (
    <div className="app">
      <Live2DStage />
    </div>
  );
}
