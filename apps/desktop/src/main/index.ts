import { existsSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { app, BrowserWindow, ipcMain, net, protocol } from "electron";

const LOCAL_ASSET_SCHEME = "lumina-model";
const MODEL_SCOPE = "model";
const RUNTIME_SCOPE = "runtime";
const WINDOW_DRAG_CHANNEL = "lumina:window-drag";

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
 * 创建桌宠主窗口（透明、无边框、非置顶）。
 */
function createMainWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 420,
    height: 680,
    transparent: true,
    backgroundColor: "#00000000",
    frame: false,
    resizable: true,
    movable: true,
    webPreferences: {
      preload: path.join(__dirname, "../preload/index.js"),
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  if (process.env.ELECTRON_RENDERER_URL) {
    void win.loadURL(process.env.ELECTRON_RENDERER_URL);
  } else {
    void win.loadFile(path.join(__dirname, "../renderer/index.html"));
  }

  return win;
}

app.whenReady().then(() => {
  registerLocalAssetProtocol();
  registerWindowDragEvents();
  createMainWindow();

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
