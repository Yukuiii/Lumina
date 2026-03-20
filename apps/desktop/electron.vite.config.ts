import path from "node:path";
import { defineConfig } from "electron-vite";
import react from "@vitejs/plugin-react";

/**
 * Electron + Vite 的构建配置。
 *
 * renderer 使用多页配置：
 * - index.html → 主桌宠窗口
 * - settings.html → 设置子窗口
 */
export default defineConfig({
  main: {},
  preload: {},
  renderer: {
    plugins: [react()],
    resolve: {
      alias: {
        "@renderer": path.join(__dirname, "src/renderer/src"),
        "@lumina/protocol": path.resolve(__dirname, "../../packages/protocol/src/index.ts")
      }
    },
    build: {
      rollupOptions: {
        input: {
          main: path.join(__dirname, "src/renderer/index.html"),
          settings: path.join(__dirname, "src/renderer/settings.html")
        }
      }
    }
  }
});
