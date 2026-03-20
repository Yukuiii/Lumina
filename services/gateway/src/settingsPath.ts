import { homedir } from "node:os";
import * as path from "node:path";

const APP_DIR_NAME = "lumina";
const SETTINGS_FILENAME = "settings.json";

/**
 * 返回 settings.json 的绝对路径。
 *
 * 优先使用 LUMINA_SETTINGS_PATH 环境变量（测试/CI 场景），
 * 否则按平台标准用户数据目录拼接。
 */
export function getLuminaSettingsFilePath(): string {
  if (process.env.LUMINA_SETTINGS_PATH) {
    return process.env.LUMINA_SETTINGS_PATH;
  }

  const base =
    process.platform === "darwin"
      ? path.join(homedir(), "Library", "Application Support")
      : process.platform === "win32"
        ? (process.env.APPDATA ?? path.join(homedir(), "AppData", "Roaming"))
        : (process.env.XDG_CONFIG_HOME ?? path.join(homedir(), ".config"));

  return path.join(base, APP_DIR_NAME, SETTINGS_FILENAME);
}
