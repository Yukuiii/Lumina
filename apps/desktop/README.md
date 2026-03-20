# @lumina/desktop

Lumina 桌面端：Electron 透明窗口 + Live2D 渲染 + WebSocket 流式联调 UI。

## 本地启动

在仓库根目录执行：

1. 安装依赖：`npm install`
2. 启动桌面端：`npm run dev:desktop`
3. 按 `Cmd+,`（macOS）或 `Ctrl+,` 打开设置面板，配置 LLM 提供商和 API Key
4. 启动 Gateway：`npm run dev:gateway`（第二个终端）

> **首次使用必须先在设置面板配置 LLM**，否则 Gateway 启动会报错。
> 也可通过系统托盘右键菜单 → 「设置」打开设置面板。

桌面端启动后：
- Enter 打开输入框，发送消息即可对话
- 双击模型空白区域也可打开输入框
