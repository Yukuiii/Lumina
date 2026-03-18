/// <reference types="vite/client" />

/**
 * preload 暴露到 window 的最小 API 声明。
 */
declare global {
  interface Window {
    lumina: {
      /** 获取 Electron/Chrome/Node 的版本信息。 */
      getVersions(): { electron: string; chrome: string; node: string };
      /** 获取指定 Live2D 模型文件的本地可读 URL。 */
      getLive2DModelUrl(relativePath: string): string;
      /** 获取 Cubism Core 运行时脚本的本地可读 URL。 */
      getLive2DCoreScriptUrl(): string;
      /** 根据指针移动量拖动当前桌宠窗口。 */
      dragWindowBy(deltaX: number, deltaY: number): void;
    };
    Live2DCubismCore?: unknown;
  }
}

export {};
