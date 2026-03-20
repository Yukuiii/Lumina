# @lumina/gateway

Lumina 云端编排服务：负责 WebSocket 会话、事件协议与 LLM 流式对接。

## 配置

Gateway 从两个来源读取配置（优先级从高到低）：

1. **环境变量**（CI/部署场景）
2. **`settings.json`** — 桌面端设置面板写入的配置文件

### LLM 配置

首次使用前，请先启动桌面端（`npm run dev:desktop`），按 `Cmd+,` 打开设置面板配置 LLM 提供商和 API Key。
设置保存后，Gateway 会在下一条 `text.user` 请求开始前重新读取最新的 LLM 配置，无需重启进程。

如需通过环境变量覆盖（CI/部署场景）：

| 变量 | 说明 | 默认值 |
|------|------|--------|
| `LLM_PROVIDER` | 提供商：`openai` / `openai-responses` / `claude` / `gemini` | — |
| `LLM_API_KEY` | API Key | — |
| `LLM_MODEL` | 模型名 | provider 默认 |
| `LLM_BASE_URL` | API 端点 | provider 默认 |
| `LLM_SYSTEM_PROMPT` | 系统提示词 | 内置桌宠角色 |
| `LLM_MAX_TOKENS` | 最大输出 token 数 | provider 默认 |

### Gateway 配置

| 变量 | 说明 | 默认值 |
|------|------|--------|
| `GATEWAY_PORT` / `PORT` | 端口 | `8787` |
| `GATEWAY_HOST` / `HOST` | 监听地址 | `127.0.0.1` |
| `LOG_LEVEL` | 日志级别 | `info` |

## 本地启动

```bash
npm install
npm run dev:gateway
```

默认监听：
- `http://127.0.0.1:8787/health`
- `ws://127.0.0.1:8787/ws`
