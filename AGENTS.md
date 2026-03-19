# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 项目简介

Lumina 是一个桌面端数字人/桌宠项目：本地 Live2D 渲染 + 云端 ASR/LLM/TTS 流式编排。目标是以最低复杂度跑通低延迟语音对话闭环，保留后续升级 WebRTC、替换云端厂商的扩展空间。当前处于 MVP 阶段（v0.1.0）。

## 常用命令

```bash
# 安装依赖
npm install

# 开发（需要两个终端）
npm run dev:gateway   # 启动 WebSocket 网关 (127.0.0.1:8787)
npm run dev:desktop   # 启动 Electron 桌面应用

# 全量构建
npm run build

# 类型检查
npm run typecheck

# 单包操作
npm --workspace @lumina/protocol run build
npm --workspace @lumina/gateway run build
npm --workspace @lumina/desktop run build
```

## Monorepo 结构

npm workspaces 管理，三个工作区：

- **`packages/protocol`** (`@lumina/protocol`) — 共享 WebSocket 协议定义，导出消息包络类型 `WsEnvelope<T>`、事件常量 `WS_EVENT_TYPE`、Zod 校验函数 `safeParseWsEnvelope()`、工厂函数 `createEnvelope()`
- **`services/gateway`** (`@lumina/gateway`) — 基于 Fastify + @fastify/websocket 的云端编排网关，负责会话管理、事件路由、流式编排与背压控制
- **`apps/desktop`** (`@lumina/desktop`) — Electron + React + Pixi.js 桌面应用，透明无边框置顶窗口

依赖关系：`desktop` → `protocol` ← `gateway`

## 架构要点

### 通信模型

```
Desktop (Electron) ←──WebSocket JSON──→ Gateway (Fastify) ←──HTTP/SDK──→ ASR/LLM/TTS
```

所有 WebSocket 消息遵循统一包络格式：`{ type, sessionId, seq, timestampMs, payload }`。协议定义见 `docs/PROTOCOL_WS_V0.md`。

### 关键事件类型

客户端→网关：`session.start`, `audio.start/chunk/end`, `control.interrupt`, `text.user`（开发联调用）
网关→客户端：`asr.partial/final`, `vad.start/end`, `llm.delta/final`, `tts.audio.chunk/end`, `error`

### Desktop 进程架构（Electron）

- **主进程** (`apps/desktop/src/main/index.ts`)：创建透明置顶窗口，Context Isolation + Preload 沙箱
- **Preload** (`apps/desktop/src/preload/index.ts`)：通过 `contextBridge` 暴露最小 API（仅 `lumina.getVersions()`）
- **渲染进程** (`apps/desktop/src/renderer/`)：React 应用，WebSocket 连接管理、消息收发、日志展示
- 构建工具：electron-vite（封装 Vite 7），配置在 `electron.vite.config.ts`

### Gateway 设计

- 每个 WebSocket 连接分配唯一 `sessionId`，维护递增序号 `seq`
- 事件路由：基于消息 `type` 的 switch 分发
- 流式中断：AbortController 实现 barge-in，新输入自动取消旧流
- 当前使用 mock LLM（固定文案分块发送），后续通过 Adapter 模式接入真实厂商

## 设计原则

- **协议稳定优先**：桌面端只依赖 `PROTOCOL_WS_V0` 事件契约，厂商差异全部在 Gateway Adapter 消化
- **YAGNI**：优先做流式体验与可替换适配层，避免一次性引入 WebRTC 等高复杂度组件
- **OCP**：ASR/LLM/TTS 通过 Adapter 隔离，新增厂商仅需新增实现类

## 技术栈

| 层级 | 技术 |
|------|------|
| 桌面框架 | Electron 41 + electron-vite 5 |
| 前端 | React 19 + Vite 7 |
| 渲染引擎 | Pixi.js 8（Live2D 集成预留） |
| 网关 | Fastify 5 + @fastify/websocket |
| 协议校验 | Zod 3.24 |
| 语言 | TypeScript 5.6（strict 模式） |

## 文档

- `docs/TECH_SELECTION.md` — 技术选型与设计理由
- `docs/ARCHITECTURE.md` — 模块边界与职责
- `docs/PROTOCOL_WS_V0.md` — WebSocket 协议规范
- `docs/MVP_CHECKLIST.md` — MVP 验收清单
