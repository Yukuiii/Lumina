import { contextBridge, ipcRenderer } from "electron";

const LOCAL_ASSET_SCHEME = "lumina-model";
const WINDOW_DRAG_CHANNEL = "lumina:window-drag";
const SETTINGS_GET_CHANNEL = "lumina:get-settings";
const SETTINGS_SAVE_CHANNEL = "lumina:save-settings";
const SETTINGS_OPEN_CHANNEL = "lumina:open-settings";
const MIC_PERMISSION_CHANNEL = "lumina:request-mic-permission";

/**
 * 构造渲染进程可访问的本地资源 URL。
 */
function createAssetUrl(scope: "model" | "runtime", relativePath: string): string {
  const encodedPath = relativePath
    .split(/[\\/]+/)
    .filter(Boolean)
    .map((segment) => encodeURIComponent(segment))
    .join("/");

  return `${LOCAL_ASSET_SCHEME}://${scope}/${encodedPath}`;
}

/**
 * 向渲染进程暴露最小受控能力（避免直接开启 NodeIntegration）。
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
  },

  /**
   * 获取指定 Live2D 模型文件的本地可读 URL。
   */
  getLive2DModelUrl(relativePath: string): string {
    return createAssetUrl("model", relativePath);
  },

  /**
   * 获取 Cubism Core 运行时脚本的本地可读 URL。
   */
  getLive2DCoreScriptUrl(): string {
    return createAssetUrl("runtime", "live2dcubismcore.min.js");
  },

  /**
   * 根据指针移动量拖动当前桌宠窗口。
   */
  dragWindowBy(deltaX: number, deltaY: number): void {
    if (!Number.isFinite(deltaX) || !Number.isFinite(deltaY)) {
      return;
    }

    ipcRenderer.send(WINDOW_DRAG_CHANNEL, { deltaX, deltaY });
  },

  /**
   * 获取当前持久化的设置（API key 脱敏）。
   */
  getSettings(): Promise<unknown> {
    return ipcRenderer.invoke(SETTINGS_GET_CHANNEL);
  },

  /**
   * 保存设置到本地文件。
   */
  saveSettings(payload: unknown): Promise<unknown> {
    return ipcRenderer.invoke(SETTINGS_SAVE_CHANNEL, payload);
  },

  /**
   * 打开设置子窗口（由 main process 管理窗口生命周期）。
   */
  openSettings(): Promise<void> {
    return ipcRenderer.invoke(SETTINGS_OPEN_CHANNEL);
  },

  /**
   * 请求 macOS 麦克风权限（通过主进程 systemPreferences）。
   */
  requestMicPermission(): Promise<{ status: "granted" | "denied" }> {
    return ipcRenderer.invoke(MIC_PERMISSION_CHANNEL) as Promise<{ status: "granted" | "denied" }>;
  }
});
