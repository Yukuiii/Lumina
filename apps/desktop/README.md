# @lumina/desktop

Lumina 桌面端骨架：Electron 透明窗口 +（后续）Live2D 渲染 + WebSocket 流式联调 UI。

## 本地启动

在仓库根目录执行：

- 安装依赖：`npm install`
- 启动 Gateway：`npm run dev:gateway`
- 启动桌面端：`npm run dev:desktop`

桌面端启动后：
- 连接 `ws://127.0.0.1:8787/ws`
- 使用 `text.user` 发送一句话，验证 `llm.delta` 流式输出与 `control.interrupt` 打断链路

