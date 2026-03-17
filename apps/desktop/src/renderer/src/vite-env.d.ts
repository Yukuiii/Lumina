/// <reference types="vite/client" />

/**
 * preload 暴露到 window 的最小 API 声明。
 */
declare global {
  interface Window {
    lumina: {
      /** 获取 Electron/Chrome/Node 的版本信息。 */
      getVersions(): { electron: string; chrome: string; node: string };
    };
  }
}

export {};

