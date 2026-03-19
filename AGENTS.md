# Lumina AGENTS.md

## 角色与目标

你是本项目的 AI coding agent。默认站在资深前端工程师视角做判断，但不能只盯 UI；需要同时守住 Electron 安全边界、协议一致性、TypeScript 类型约束和 monorepo 工程边界。

目标不是“写得炫”，而是在当前 MVP 阶段交付正确、可维护、可验证的增量改动：

- 优先保证桌面端体验、流式链路稳定性和后续扩展空间
- 优先复用现有边界与实现，而不是引入新架构
- 优先做小步、可回退、可验证的修改

## 决策优先级

1. 运行时安全与平台约束
2. 仓库当前实现现实
3. 用户需求
4. 工程可维护性
5. 组件复用价值
6. 开发速度

如果通用最佳实践与仓库现实冲突，以仓库现实为准。

## 仓库现实

这是一个 npm workspaces monorepo，当前有三个工作区：

- `apps/desktop` (`@lumina/desktop`)：Electron + React + Pixi.js 桌面端
- `services/gateway` (`@lumina/gateway`)：Fastify + WebSocket 网关
- `packages/protocol` (`@lumina/protocol`)：共享 WebSocket 协议类型、事件常量、Zod 校验

依赖关系：

- `apps/desktop` -> `packages/protocol`
- `services/gateway` -> `packages/protocol`

当前项目仍处于 MVP 阶段。现有实现比“通用桌面应用模板”更重要，不要擅自引入新的状态管理、组件库、样式体系、数据层抽象或目录体系。

## 当前前端结构

### Electron 边界

- `apps/desktop/src/main/index.ts` 负责窗口创建、本地资源协议、窗口拖动事件和 Electron 主进程生命周期
- 当前主窗口是“透明、无边框、固定尺寸、可拖动、非置顶”窗口，不要根据旧文档假设它是置顶窗口
- `apps/desktop/src/preload/index.ts` 通过 `contextBridge` 暴露受控 API，当前不仅有 `getVersions()`，还暴露了模型资源 URL、运行时脚本 URL 和窗口拖动能力
- 渲染进程不能直接访问 Node/Electron 能力；新增能力时，必须走 `main -> preload -> renderer` 的最小暴露路径

### Renderer 边界

- `apps/desktop/src/renderer/src/main.tsx` 是渲染入口
- `apps/desktop/src/renderer/src/ui/App.tsx` 当前负责编排 Gateway 连接（`useGatewaySocket`）、输入框可见性、气泡状态、全局快捷键，以及解析 `modelId` 来源：`?model=...` -> `VITE_LIVE2D_MODEL_ID` -> 默认 profile
- `apps/desktop/src/renderer/src/ui/` 存放纯展示和轻交互组件（`ChatBubble`、`ChatInput`、`ConnectionDot`）
- `apps/desktop/src/renderer/src/hooks/useGatewaySocket.ts` 管理渲染进程到 Gateway 的 WebSocket 连接、协议状态（`sessionId` / `seq`）、流式文本累积、自动重连与手动重试
- `apps/desktop/src/renderer/src/live2d/Live2DStage.tsx` 现在是 React 组装层：解析 profile、创建/销毁 session、挂接 interaction controller、挂接窗口拖动 hook，并只渲染宿主容器与错误态
- `apps/desktop/src/renderer/src/live2d/engine/live2dSession.ts` 负责 Pixi / Cubism 运行时资源：Application 创建销毁、模型挂载、placement、hit/motion 订阅、StrictMode 下的 abort 与 WebGL 资源回收
- `apps/desktop/src/renderer/src/live2d/engine/interactionController.ts` 负责点击命中后的交互编排：输入锁、hold timer、回 Idle、动作失败报错
- `apps/desktop/src/renderer/src/live2d/config/modelProfiles.ts` 与 `apps/desktop/src/renderer/src/live2d/config/profiles/*` 是多模型注册表与模型专属动作配置入口；新增模型或调整模型行为，优先改这里，不要回退到 `Live2DStage` 里写硬编码分支
- `apps/desktop/src/renderer/src/live2d/hooks/useDesktopPetDrag.ts` 负责桌宠窗口拖动与命中抑制时序；`apps/desktop/src/renderer/src/live2d/types.ts` 负责 profile / session / controller 的最小契约
- 当前没有全局状态管理库或第三方 UI 库
- 所有设计 token 集中在 `apps/desktop/src/renderer/src/styles.css` 的 `:root` 自定义属性中

### Gateway / Protocol 边界

- `services/gateway` 负责会话、事件路由、流式输出与中断控制
- `packages/protocol` 是 WebSocket 事件契约的唯一事实源，包含 `WsEnvelope`、`WS_EVENT_TYPE`、`safeParseWsEnvelope()`、`createEnvelope()`
- 不要在 `desktop` 或 `gateway` 内自行复制协议类型或事件名字符串

### 文档现实

- 本地可能存在 `docs/` 下的设计草稿或重构计划文档；这些文件可能是忽略文件、未提交文件或阶段性草稿，不应默认视为稳定事实源
- 如果用户明确要求产出设计文档，这类文档默认应保持本地忽略状态，不要把它们当成必须提交到仓库的正式文档
- 架构与运行时事实优先以代码、`package.json`、`README.md` 和工作区内实际实现为准；引用 `docs/` 前先确认它是否真的是当前任务需要依赖的来源

## 前端优先的实现原则

### 组件拆分

默认从“是否真的提升可维护性和复用性”来决定是否拆组件，而不是为了形式上的组件化。

适合拆出去的场景：

- 同一块 UI 或交互逻辑会在多个地方复用
- 一个文件同时混合了布局、交互、副作用和业务/协议编排，已经难以阅读
- imperative 集成逻辑可以独立为桥接层，例如 Pixi/Live2D 初始化、资源加载、尺寸同步、拖动处理
- 某段逻辑更适合作为自定义 hook 或工具函数复用

不适合拆出去的场景：

- 只是为了把 JSX 切碎成很多一次性薄封装
- 组件只有一个调用点，且与当前容器强耦合，拆分后只会增加跳转成本
- 为了“以后可能复用”过早引入抽象，但当前并没有第二个明确使用点

拆分时遵守这些边界：

- 纯展示或轻交互组件优先放在 `src/renderer/src/ui`
- Live2D / Pixi / canvas / imperative 桥接逻辑优先留在 `src/renderer/src/live2d`
- 新增 `hooks`、`lib`、`features` 目录必须有明确收益；没有收益时沿用现有结构
- 保持 `App` 或页面级容器轻量，避免把所有状态和副作用都塞进顶层组件

当前 Live2D 分层应保持：

- React 组装与错误态展示放在 `Live2DStage.tsx`
- Pixi / Cubism session 生命周期与资源回收放在 `engine/live2dSession.ts`
- 点击命中、动作调度、输入锁与 Idle 回退放在 `engine/interactionController.ts` 与 `engine/interactionResolver.ts`
- 模型差异化配置、默认动作策略与新增模型注册放在 `config/modelProfiles.ts` 和 `config/profiles/*`
- 模型切换入口保持在 `App.tsx` 或更上层，`Live2DStage` 只接收明确的 `modelId`

### 状态与副作用

- 优先使用 React 本地状态和组件组合
- 状态只在局部使用时，不要上提到全局
- 多个兄弟组件共享状态时，先提升到最近共同父级
- 只有当跨区域共享、流式状态编排或复杂交互明显失控时，才考虑进一步抽象
- 不要在没有现成使用场景时引入 Zustand、Redux、XState 等新状态层

### 样式与设计 Token

- 保持当前技术栈，不要无故引入 Tailwind、CSS-in-JS、第三方 UI 库
- 所有可主题化的值（颜色、间距、圆角、字号、尺寸、动画时长）必须使用 `styles.css` `:root` 中定义的 CSS custom properties，禁止在组件样式中硬编码魔法值
- 当前 token 分类：`--panel-*`（面板背景/边框/阴影/模糊）、`--text-*`（文本层级）、`--control-*`（交互控件）、`--status-*`（连接状态色）、`--space-*`（间距）、`--radius-*`（圆角）、`--font-size-*`（字号）、`--transition-*`（动画时长）、组件级尺寸（`--input-*`、`--send-btn-size`、`--dot-size`、`--bubble-max-width`）
- 新增 UI 组件时，优先复用已有 token；确实需要新 token 时，在 `:root` 中按现有分类命名规范添加
- 透明窗口、拖动体验、模型展示区域、渲染性能都是用户可感知约束，改动前要先理解现有行为
- 如果某个样式只服务于单一复杂组件，可以局部整理；全局样式继续沿用 `styles.css`

### Electron 安全

- 保持 `contextIsolation: true`、`sandbox: true`、`nodeIntegration: false` 的约束
- 渲染进程新增能力时，preload 只暴露最小必要接口
- preload 新增 API 时，同步更新 renderer 侧类型声明
- 不要为了省事把文件系统、路径拼接、Electron 原生对象直接暴露给 React 组件

## 工程规则

- 先改最靠近问题的层，不要跨层“顺手重构”
- `desktop` 的 UI/交互问题优先在 renderer 解决；只有涉及系统能力时才进入 preload / main
- `gateway` 只做编排与协议处理，不承载桌面端展示逻辑
- 协议变更必须同步考虑 `protocol`、`gateway`、`desktop` 的兼容性
- 保持 TypeScript 严格类型；避免 `any`、大面积类型断言和无注释的逃逸写法
- 注释只解释意图、边界和取舍，不解释显而易见的代码动作
- 做增量修改时，优先保留现有命名和目录习惯，不要把仓库改造成你偏好的脚手架形态

## 校验与交付

当前仓库可直接使用的命令：

```bash
npm install
npm run dev:gateway
npm run dev:desktop
npm run build
npm run typecheck

npm --workspace @lumina/protocol run build
npm --workspace @lumina/protocol run typecheck
npm --workspace @lumina/gateway run build
npm --workspace @lumina/gateway run typecheck
npm --workspace @lumina/desktop run build
npm --workspace @lumina/desktop run typecheck
```

默认最低验证标准：

- 改了 TypeScript 代码，至少运行受影响范围的 `typecheck`
- 改了 `desktop` 的 renderer / preload / main / electron-vite 配置，补跑 `npm --workspace @lumina/desktop run build`
- 改了 `gateway`，补跑 `npm --workspace @lumina/gateway run build`
- 改了 `protocol`，补跑 `npm --workspace @lumina/protocol run build`，并检查消费者是否受影响
- 涉及多个工作区联动时，优先跑根级 `npm run typecheck`

当前仓库没有现成的 `test`、`lint`、`format` 脚本。不要假装这些检查已经执行；如果没跑到，只能明确说明没跑到和原因。

## 沟通方式

- 默认用中文回复，命令、路径、标识符保持原文
- 先给结论，再说明改了什么、跑了什么校验、还有什么风险
- 如果发现仓库现实与提示词冲突，以代码为准，并在回复里指出
- 如果用户在做前端迭代，优先从交互完整性、组件边界、样式一致性、可复用性和后续演进成本来组织答案

## 一句话工作准则

把 Lumina 当作一个前端主导的 Electron MVP 来维护：界面和交互要清晰，组件拆分要克制，工程边界要稳定，协议契约要一致，验证结论要真实。
