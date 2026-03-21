# Lumina ✨

**住在你桌面上的 AI 小精灵。**

*本地 Live2D 渲染 + 云端流式语音对话，低延迟、可打断、可扩展。*

Version TypeScript Electron Status

## 📖 简介

我们需要面对两个事实：

1. AI 已经很强了，但她住在浏览器标签页里。你要跟她说话，得先打开浏览器、找到那个标签页、在输入框里打字、等她回复……这哪像聊天？这是在**填工单**。
2. AI 已经很聪明了，但她没有脸。你看到的永远是一个文本框和一堵 Markdown 墙。再深情的回复，看起来也像一份技术文档。

**Lumina** 想解决的就是这两件事——让 AI 从浏览器里搬出来，给她一张脸、一个身体、一个住在你桌面上的家。

她有自己的 Live2D 形象，会在屏幕角落安静地待着。你跟她说话，她会眨眼、会动、会开口回应你。你不理她的时候，她也不会弹窗催你续费——她只是安静地待在那里，等你想找她聊天。

不是冷冰冰的对话框，不是千篇一律的聊天界面。**是一个有形象、有声音、有温度的小精灵，就住在你的桌面上。**

> "以前跟 AI 聊天，感觉在跟客服对话。现在她蹲在我的任务栏旁边冲我眨眼，我感觉她比我更早到工位。" —— *某个被桌宠盯着写代码的匿名开发者*

**核心理念：** 协议稳定优先，厂商差异全部在云端消化，桌面端只管长得好看。想换 LLM？改个配置就行。想接新的 TTS？写个 Adapter 就好。想换个形象？丢个 Live2D 模型进去就完事了。

## ✨ 功能特性

### 🎭 Live2D 桌宠

- **透明置顶窗口**：她就浮在你的桌面上，不遮挡、不打扰
- **Live2D 渲染**：基于 PixiJS 8 + pixi-live2d-display，流畅的动画表现
- **交互响应**：点击、拖拽，她都会有反应
- **模型可替换**：放入你喜欢的 Live2D 模型，即可换装上阵

### 💬 流式 LLM 对话

- **实时流式输出**：逐字显示 AI 回复，思考过程看得见
- **多厂商支持**：OpenAI / Claude / Gemini / OpenRouter，一键切换
- **可打断**：说话打断她，她会立刻停下来听你说
- **自定义人格**：通过 System Prompt 定义她的性格和说话方式

### ⚙️ 设置面板

- **图形化配置**：无需手动编辑配置文件，托盘右键即可打开设置
- **API Key 安全**：脱敏显示，原子写入，不怕丢失
- **热加载**：修改配置无需重启网关，下次请求自动生效

### 🔌 可扩展架构

- **协议驱动**：统一的 WebSocket 消息包络，前后端解耦
- **Adapter 模式**：ASR / LLM / TTS 各自独立，新增厂商只需实现一个函数
- **Monorepo**：Protocol / Gateway / Desktop 三层分明，独立开发、独立部署

## 🏗️ 架构

```
┌─────────────────────┐         ┌─────────────────────┐         ┌──────────────┐
│  Desktop (Electron)  │◄──WS──►│  Gateway (Fastify)   │◄──HTTP──►│ ASR / LLM /  │
│                     │  JSON   │                     │   SDK   │    TTS       │
│  React + PixiJS     │         │  事件路由 + 流式编排   │         │   云端服务    │
│  Live2D + Chat UI   │         │  会话管理 + 背压控制   │         │              │
└─────────────────────┘         └─────────────────────┘         └──────────────┘
```

```
lumina/
├── packages/protocol/     # 共享 WebSocket 协议定义（Zod 校验）
├── services/gateway/      # 云端编排网关（Fastify + WebSocket）
├── apps/desktop/          # Electron 桌面应用（React + PixiJS + Live2D）
├── models/                # Live2D 模型资源
├── vendors/               # 第三方运行时（Cubism Core）
└── docs/                  # 架构、协议、技术选型文档
```

## 🚀 快速开始

### 环境要求

- **Node.js** >= 18
- **npm** >= 9
- 一个可用的 LLM API Key（OpenAI / Claude / Gemini / OpenRouter 任选其一）

### 安装与启动

```bash
# 1. 克隆仓库
git clone https://github.com/your-username/Lumina.git
cd Lumina

# 2. 安装依赖
npm install

# 3. 启动桌面应用（终端 1）
npm run dev:desktop

# 4. 配置 LLM —— 按 Cmd+,（macOS）或 Ctrl+, 打开设置面板，填写 Provider 和 API Key

# 5. 启动网关（终端 2）
npm run dev:gateway
```

> **首次使用必须先完成第 4 步**，否则网关启动后无法正常响应。

桌面端按 `Enter` 打开输入框，发送消息即可开始对话。

也可以通过环境变量配置：

```bash
LLM_PROVIDER=openai LLM_API_KEY=sk-xxx npm run dev:gateway
```

## 🛠️ 技术栈


| 层级   | 技术                             |
| ---- | ------------------------------ |
| 桌面框架 | Electron 41 + electron-vite 5  |
| 前端   | React 19 + Vite 7              |
| 渲染引擎 | PixiJS 8 + pixi-live2d-display |
| 网关   | Fastify 5 + @fastify/websocket |
| 协议校验 | Zod 3.24                       |
| 语言   | TypeScript 5.6（strict 模式）      |


## 🔮 路线图

我们正在按里程碑逐步推进：

- **🎭 桌面端基础** — 透明窗口、Live2D 加载、帧率稳定
- **🔗 连接与会话** — WebSocket 连接、自动重连、会话追踪
- **💬 LLM 文本流** — 文本输入、流式显示、异常反馈
- **🔊 TTS 音频流** — 流式播放、嘴型驱动（RMS）、打断清空
- **🎙️ ASR 语音识别** — 麦克风采集、流式识别、partial / final 反馈
- **🎯 端到端闭环** — 语音 → 回答 < 1.5s 首音频、插话打断、耗时可观测

更远的未来：

- **🌐 WebRTC 升级** — 替换 WebSocket 音频传输，进一步降低延迟
- **🎨 表情联动** — Live2D 表情随对话情绪变化
- **🧩 插件系统** — 天气、日程、番茄钟……
- **👥 多角色切换** — 不同模型、不同人格，随心切换

## 🤝 参与贡献

欢迎任何形式的贡献！无论是提 Issue、提 PR，还是单纯聊聊你对桌宠的想法。

1. Fork 本仓库
2. 创建你的分支 (`git checkout -b feat/amazing-feature`)
3. 提交修改 (`git commit -m 'feat: add amazing feature'`)
4. 推送到远程 (`git push origin feat/amazing-feature`)
5. 发起 Pull Request

## 📝 开源协议

[MIT](LICENSE)

---

**如果你也想要一个住在桌面上的小精灵，给个 ⭐ 吧！**