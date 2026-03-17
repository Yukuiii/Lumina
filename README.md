# Lumina

Lumina 是一个面向桌面端的数字人/桌宠项目：**本地 Live2D 渲染 + 云端 ASR/LLM/TTS 流式编排**，目标是以最低复杂度跑通低延迟语音对话闭环，并保留后续升级 WebRTC、替换云端厂商的扩展空间。

## 文档

- 技术选型：`TECH_SELECTION.md`
- 架构说明：`docs/ARCHITECTURE.md`
- WebSocket 协议（v0）：`docs/PROTOCOL_WS_V0.md`
- MVP 验收清单：`docs/MVP_CHECKLIST.md`

## 快速开始（本地联调）

前置：
- Node.js（建议 20+）

步骤（需要两个终端）：
1) 安装依赖：`npm install`
2) 启动 Gateway：`npm run dev:gateway`
3) 启动桌面端：`npm run dev:desktop`

桌面端启动后：
- 在输入框填 `ws://127.0.0.1:8787/ws` 并点击“连接”
- 输入一句话并发送，应该能看到 `llm.delta` 的流式日志

## 约定

- 优先做“流式体验”与“可替换适配层”，避免一次性引入 WebRTC 等高复杂度组件（YAGNI）。
- ASR/LLM/TTS 厂商通过 Adapter 隔离，桌面端仅面向稳定协议（OCP）。

