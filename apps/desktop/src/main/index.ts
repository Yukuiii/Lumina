import { existsSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { app, BrowserWindow, ipcMain, Menu, net, nativeImage, protocol, systemPreferences, Tray } from "electron";
import { readSettings, toPublicSettings, writeSettings } from "./settingsStore";
import type { LuminaSettingsSavePayload } from "./settingsStore";

const LOCAL_ASSET_SCHEME = "lumina-model";
const MODEL_SCOPE = "model";
const RUNTIME_SCOPE = "runtime";
const WINDOW_DRAG_CHANNEL = "lumina:window-drag";
const SETTINGS_GET_CHANNEL = "lumina:get-settings";
const SETTINGS_SAVE_CHANNEL = "lumina:save-settings";
const SETTINGS_OPEN_CHANNEL = "lumina:open-settings";
const MIC_PERMISSION_CHANNEL = "lumina:request-mic-permission";
const MAIN_WINDOW_WIDTH = 500;
const MAIN_WINDOW_HEIGHT = 500;
const SETTINGS_WINDOW_WIDTH = 480;
const SETTINGS_WINDOW_HEIGHT = 560;

// 模块级强引用，防止 GC 回收。
let tray: Tray | null = null;
let settingsWindow: BrowserWindow | null = null;

protocol.registerSchemesAsPrivileged([
  {
    scheme: LOCAL_ASSET_SCHEME,
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      corsEnabled: true
    }
  }
]);

/**
 * 解析模型目录根路径，优先命中当前仓库根目录。
 */
function resolveModelsRoot(): string {
  const candidates = [
    path.resolve(process.cwd(), "models"),
    path.resolve(app.getAppPath(), "../../models"),
    path.resolve(app.getAppPath(), "models")
  ];

  return candidates.find((candidate) => existsSync(candidate)) ?? candidates[0];
}

/**
 * 解析 Live2D 运行时文件目录。
 */
function resolveRuntimeRoot(): string {
  const candidates = [
    path.resolve(process.cwd(), "vendors/live2d"),
    path.resolve(app.getAppPath(), "../../vendors/live2d"),
    path.resolve(app.getAppPath(), "vendors/live2d")
  ];

  return candidates.find((candidate) => existsSync(candidate)) ?? candidates[0];
}

/**
 * 将自定义协议 URL 映射为仓库内的安全本地文件路径。
 */
function resolveLocalAssetPath(requestUrl: string): string | null {
  const url = new URL(requestUrl);
  const normalizedPath = path.posix.join(url.hostname, decodeURIComponent(url.pathname).replace(/^\/+/, ""));

  let baseRoot: string;
  let relativePath: string;

  if (normalizedPath === MODEL_SCOPE || normalizedPath.startsWith(`${MODEL_SCOPE}/`)) {
    baseRoot = resolveModelsRoot();
    relativePath = normalizedPath.slice(MODEL_SCOPE.length).replace(/^\/+/, "");
  } else if (normalizedPath === RUNTIME_SCOPE || normalizedPath.startsWith(`${RUNTIME_SCOPE}/`)) {
    baseRoot = resolveRuntimeRoot();
    relativePath = normalizedPath.slice(RUNTIME_SCOPE.length).replace(/^\/+/, "");
  } else {
    return null;
  }

  const safeSegments = relativePath.split("/").filter(Boolean);
  const assetPath = path.resolve(baseRoot, ...safeSegments);
  const relativeToRoot = path.relative(baseRoot, assetPath);

  if (relativeToRoot.startsWith("..") || path.isAbsolute(relativeToRoot)) {
    return null;
  }

  return assetPath;
}

/**
 * 注册本地只读资源协议，供渲染进程安全读取模型与 Cubism Core。
 */
function registerLocalAssetProtocol(): void {
  if (protocol.isProtocolHandled(LOCAL_ASSET_SCHEME)) {
    protocol.unhandle(LOCAL_ASSET_SCHEME);
  }

  protocol.handle(LOCAL_ASSET_SCHEME, async (request) => {
    const assetPath = resolveLocalAssetPath(request.url);

    if (!assetPath || !existsSync(assetPath)) {
      return new Response("Not Found", { status: 404 });
    }

    return net.fetch(pathToFileURL(assetPath).toString());
  });
}

/**
 * 注册桌宠窗口拖动事件，供渲染进程按鼠标位移移动窗口。
 */
function registerWindowDragEvents(): void {
  ipcMain.removeAllListeners(WINDOW_DRAG_CHANNEL);
  ipcMain.on(WINDOW_DRAG_CHANNEL, (event, payload: unknown) => {
    const win = BrowserWindow.fromWebContents(event.sender);

    if (!win) {
      return;
    }

    const deltaX = typeof (payload as { deltaX?: unknown })?.deltaX === "number" ? (payload as { deltaX: number }).deltaX : 0;
    const deltaY = typeof (payload as { deltaY?: unknown })?.deltaY === "number" ? (payload as { deltaY: number }).deltaY : 0;

    if (!Number.isFinite(deltaX) || !Number.isFinite(deltaY)) {
      return;
    }

    const [currentX, currentY] = win.getPosition();
    win.setPosition(Math.round(currentX + deltaX), Math.round(currentY + deltaY));
  });
}

/**
 * 注册设置相关的 IPC handle。
 */
function registerSettingsIpc(): void {
  ipcMain.handle(SETTINGS_GET_CHANNEL, () => {
    return toPublicSettings(readSettings());
  });

  ipcMain.handle(SETTINGS_SAVE_CHANNEL, (_event, payload: LuminaSettingsSavePayload) => {
    return writeSettings(payload);
  });

  ipcMain.handle(SETTINGS_OPEN_CHANNEL, () => {
    openSettingsWindow();
  });

  ipcMain.handle(MIC_PERMISSION_CHANNEL, async () => {
    if (process.platform !== "darwin") {
      return { status: "granted" as const };
    }
    const status = systemPreferences.getMediaAccessStatus("microphone");
    if (status === "granted") {
      return { status: "granted" as const };
    }
    // "not-determined" 时弹出系统授权弹窗；"denied"/"restricted" 需要用户手动去系统设置。
    if (status === "not-determined") {
      const granted = await systemPreferences.askForMediaAccess("microphone");
      return { status: granted ? "granted" as const : "denied" as const };
    }
    return { status: "denied" as const };
  });
}

/**
 * 创建桌宠主窗口（透明、无边框、非置顶、固定尺寸）。
 */
function createMainWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: MAIN_WINDOW_WIDTH,
    height: MAIN_WINDOW_HEIGHT,
    minWidth: MAIN_WINDOW_WIDTH,
    minHeight: MAIN_WINDOW_HEIGHT,
    maxWidth: MAIN_WINDOW_WIDTH,
    maxHeight: MAIN_WINDOW_HEIGHT,
    transparent: true,
    backgroundColor: "#00000000",
    frame: false,
    hasShadow: false,
    resizable: false,
    maximizable: false,
    fullscreenable: false,
    movable: true,
    webPreferences: {
      preload: path.join(__dirname, "../preload/index.js"),
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  // 允许渲染进程请求麦克风权限（ASR 语音识别需要）。
  win.webContents.session.setPermissionRequestHandler((_wc, permission, callback) => {
    callback(true);
  });
  win.webContents.session.setPermissionCheckHandler((_wc, _permission) => {
    return true;
  });

  if (process.env.ELECTRON_RENDERER_URL) {
    void win.loadURL(process.env.ELECTRON_RENDERER_URL);
  } else {
    void win.loadFile(path.join(__dirname, "../renderer/index.html"));
  }

  return win;
}

/**
 * 获取或创建主窗口，确保托盘点击时窗口可见。
 */
function getOrCreateMainWindow(): BrowserWindow {
  const allWindows = BrowserWindow.getAllWindows();
  const mainWin = allWindows.find((w) => w !== settingsWindow);

  if (mainWin) {
    return mainWin;
  }

  return createMainWindow();
}

/**
 * 打开设置子窗口（单例）。
 *
 * 已有设置窗口时聚焦；否则新建。
 * 普通窗口：有边框、不透明、合适尺寸。
 */
function openSettingsWindow(): void {
  if (settingsWindow && !settingsWindow.isDestroyed()) {
    settingsWindow.show();
    settingsWindow.focus();
    return;
  }

  settingsWindow = new BrowserWindow({
    width: SETTINGS_WINDOW_WIDTH,
    height: SETTINGS_WINDOW_HEIGHT,
    minWidth: 400,
    minHeight: 460,
    title: "Lumina 设置",
    backgroundColor: "#0a0e14",
    show: false,
    resizable: true,
    maximizable: false,
    fullscreenable: false,
    webPreferences: {
      preload: path.join(__dirname, "../preload/index.js"),
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  if (process.env.ELECTRON_RENDERER_URL) {
    // dev 模式：Vite dev server 的 settings 页面
    void settingsWindow.loadURL(`${process.env.ELECTRON_RENDERER_URL}/settings.html`);
  } else {
    void settingsWindow.loadFile(path.join(__dirname, "../renderer/settings.html"));
  }

  settingsWindow.once("ready-to-show", () => {
    settingsWindow?.show();
  });

  settingsWindow.on("closed", () => {
    settingsWindow = null;
  });
}

/**
 * 创建系统托盘（模块级强引用）。
 */
function createTray(): void {
  const iconPath = path.join(__dirname, "../../resources/tray-icon.png");
  const icon = existsSync(iconPath)
    ? nativeImage.createFromPath(iconPath).resize({ width: 16, height: 16 })
    : nativeImage.createEmpty();

  tray = new Tray(icon);
  tray.setContextMenu(
    Menu.buildFromTemplate([
      {
        label: "设置",
        click: () => openSettingsWindow()
      },
      { type: "separator" },
      { label: "退出", click: () => app.quit() }
    ])
  );
  tray.setToolTip("Lumina");
}

app.whenReady().then(async () => {
  // macOS: 请求系统级麦克风权限（ASR 需要），已授权时立即返回 true。
  if (process.platform === "darwin") {
    await systemPreferences.askForMediaAccess("microphone");
  }

  registerLocalAssetProtocol();
  registerWindowDragEvents();
  registerSettingsIpc();
  createMainWindow();
  createTray();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createMainWindow();
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});
