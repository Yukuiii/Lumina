import { contextBridge } from "electron";

/**
 * 向渲染进程暴露最小只读能力（避免直接开启 NodeIntegration）。
 */
contextBridge.exposeInMainWorld("lumina", {
  /**
   * 获取 Electron/Chrome/Node 的版本信息。
   */
  getVersions(): { electron: string; chrome: string; node: string } {
    return {
      electron: process.versions.electron,
      chrome: process.versions.chrome,
      node: process.versions.node
    };
  }
});

