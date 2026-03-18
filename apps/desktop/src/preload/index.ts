import { contextBridge } from "electron";

const LOCAL_ASSET_SCHEME = "lumina-model";

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
  }
});
