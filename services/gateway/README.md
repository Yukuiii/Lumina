# @lumina/gateway

Lumina 云端编排服务骨架：负责 WebSocket 会话、事件协议与后续 ASR/LLM/TTS 适配器对接。

## 本地启动

在仓库根目录执行：

- 安装依赖：`npm install`
- 启动开发模式：`npm run dev:gateway`

默认监听：
- `http://127.0.0.1:8787/health`
- `ws://127.0.0.1:8787/ws`

环境变量：
- `PORT`：端口（默认 `8787`）
- `HOST`：监听地址（默认 `127.0.0.1`）
