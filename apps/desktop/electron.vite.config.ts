import path from "node:path";
import { defineConfig } from "electron-vite";
import react from "@vitejs/plugin-react";

/**
 * Electron + Vite 的构建配置。
 */
export default defineConfig({
  main: {},
  preload: {},
  renderer: {
    plugins: [react()],
    resolve: {
      alias: {
        "@renderer": path.join(__dirname, "src/renderer/src")
      }
    }
  }
});

