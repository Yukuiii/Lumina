import type { Live2DWindow } from "../types";

let cubismCoreLoader: Promise<void> | null = null;

/**
 * 确保 Cubism Core 运行时脚本在当前页面中只加载一次。
 *
 * `pixi-live2d-display` 依赖全局 `Live2DCubismCore`，而 renderer 在热更新、
 * 重挂载或组件重复初始化时都可能再次请求脚本。这里通过单例 Promise 把加载过程串起来，
 * 避免重复插入 `<script>` 造成竞态。
 *
 * @param scriptUrl preload 暴露出的本地运行时脚本地址。
 * @returns 在脚本已可用时 resolve 的 Promise。
 */
export function ensureCubismCoreLoaded(scriptUrl: string): Promise<void> {
  const live2dWindow = window as Live2DWindow;

  if (live2dWindow.Live2DCubismCore) {
    return Promise.resolve();
  }

  if (cubismCoreLoader) {
    return cubismCoreLoader;
  }

  cubismCoreLoader = new Promise<void>((resolve, reject) => {
    const existingScript = document.querySelector<HTMLScriptElement>('script[data-live2d-core="true"]');

    if (existingScript) {
      existingScript.addEventListener("load", () => resolve(), { once: true });
      existingScript.addEventListener("error", () => reject(new Error("Cubism Core 脚本加载失败。")), {
        once: true
      });
      return;
    }

    const script = document.createElement("script");
    script.async = true;
    script.dataset.live2dCore = "true";
    script.src = scriptUrl;
    script.addEventListener("load", () => resolve(), { once: true });
    script.addEventListener("error", () => reject(new Error("Cubism Core 脚本加载失败。")), {
      once: true
    });
    document.head.appendChild(script);
  });

  return cubismCoreLoader;
}
