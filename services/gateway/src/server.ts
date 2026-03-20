import { randomUUID } from "node:crypto";
import Fastify from "fastify";
import websocket from "@fastify/websocket";
import type { RawData } from "ws";
import {
  createEnvelope,
  safeParseWsEnvelope,
  WS_EVENT_TYPE,
  type WsEnvelope
} from "@lumina/protocol";
import type { GatewayConfig } from "./config";
import { streamLlm } from "./llm/streamLlm";

type FastifyInstance = ReturnType<typeof Fastify>;

/**
 * 创建 Gateway（负责 WS 会话与 LLM 流式编排）。
 */
export function createGatewayServer(config: GatewayConfig): FastifyInstance {
  const app = Fastify({
    logger: {
      level: config.logLevel
    }
  });

  // 将 websocket 插件注册和 /ws 路由放在同一个 register scope 内，
  // 确保 @fastify/websocket 的 onRoute hook 在路由注册时已经就绪。
  void app.register(async (instance) => {
    await instance.register(websocket);

    instance.get(
      "/ws",
      { websocket: true },
      /**
       * WebSocket 主连接：承载音频 chunk、文本流与控制事件。
       */
      (socket) => {
        let sessionId: string = randomUUID();
        let seqOut = 0;

        let currentAbortController: AbortController | null = null;

        /**
         * 向客户端发送结构化事件。
         */
        const send = (envelope: WsEnvelope): void => {
          socket.send(JSON.stringify(envelope));
        };

        /**
         * 发送统一错误事件。
         */
        const sendError = (params: {
          code: string;
          message: string;
          retryable?: boolean;
          detail?: unknown;
        }): void => {
          send(
            createEnvelope({
              type: WS_EVENT_TYPE.Error,
              sessionId,
              seq: ++seqOut,
              payload: params
            })
          );
        };

        /**
         * 停止当前正在进行的流式输出（如果存在）。
         */
        const interrupt = (reason: string): void => {
          if (currentAbortController) {
            currentAbortController.abort(reason);
            currentAbortController = null;
          }
        };

        socket.on("close", () => {
          interrupt("socket_closed");
        });

        socket.on("message", (raw: RawData) => {
          const text = rawDataToText(raw);
          const parsed = safeParseWsEnvelope(text);
          if (!parsed.ok) {
            sendError({
              code: "bad_request",
              message: `消息解析失败：${parsed.error}`,
              retryable: false
            });
            return;
          }

          void handleClientEnvelope(parsed.value);
        });

        /**
         * 处理客户端事件（MVP：仅实现最小可跑通的 text.user 流式回显）。
         */
        const handleClientEnvelope = async (envelope: WsEnvelope): Promise<void> => {
          switch (envelope.type) {
            case WS_EVENT_TYPE.SessionStart: {
              // 关键逻辑：允许客户端显式指定 sessionId，便于端到端日志关联与重连恢复。
              if (envelope.sessionId && envelope.sessionId !== sessionId) {
                sessionId = envelope.sessionId;
              }
              return;
            }
            case WS_EVENT_TYPE.AudioStart:
            case WS_EVENT_TYPE.AudioChunk:
            case WS_EVENT_TYPE.AudioEnd: {
              // v0 骨架阶段：音频编排将在后续接入 ASR/TTS 适配器后实现。
              return;
            }
            case WS_EVENT_TYPE.ControlInterrupt: {
              interrupt("client_interrupt");
              return;
            }
            case WS_EVENT_TYPE.TextUser: {
              const payload = envelope.payload as { text?: unknown; requestId?: unknown };
              const text = typeof payload.text === "string" ? payload.text : "";
              if (!text) {
                sendError({
                  code: "invalid_payload",
                  message: "text.user.payload.text 必须为非空字符串",
                  retryable: false
                });
                return;
              }

              // 透传 requestId，用于客户端过滤跨请求的 stale delta。
              const requestId = typeof payload.requestId === "string" ? payload.requestId : undefined;

              // 关键逻辑：新输入会打断上一轮流式输出，避免多轮并发导致输出混乱。
              interrupt("new_text_user");
              const abortController = new AbortController();
              currentAbortController = abortController;

              try {
                const result = await streamLlm({
                  config: config.llm,
                  userMessage: text,
                  signal: abortController.signal,
                  onDelta: (delta) => {
                    send(
                      createEnvelope({
                        type: WS_EVENT_TYPE.LlmDelta,
                        sessionId,
                        seq: ++seqOut,
                        payload: { textDelta: delta, requestId }
                      })
                    );
                  }
                });

                if (!abortController.signal.aborted) {
                  send(
                    createEnvelope({
                      type: WS_EVENT_TYPE.LlmFinal,
                      sessionId,
                      seq: ++seqOut,
                      payload: {
                        text: result.fullText,
                        requestId
                      }
                    })
                  );
                }
              } catch (error) {
                if (!abortController.signal.aborted) {
                  sendError({
                    code: "internal_error",
                    message: "处理 text.user 失败",
                    retryable: true,
                    detail:
                      error instanceof Error ? { name: error.name, message: error.message } : error
                  });
                }
              } finally {
                if (currentAbortController === abortController) {
                  currentAbortController = null;
                }
              }
              return;
            }
            default: {
              // v0 骨架阶段：除 text.user 外其它事件先不实现，避免引入不必要复杂度。
              sendError({
                code: "not_implemented",
                message: `事件未实现：${envelope.type}`,
                retryable: false
              });
            }
          }
        };
      }
    );
  });

  app.get(
    "/health",
    /**
     * 健康检查接口。
     */
    async () => ({ ok: true })
  );

  return app;
}

/**
 * 将 ws RawData 转换为 UTF-8 文本。
 */
function rawDataToText(raw: RawData): string {
  if (typeof raw === "string") return raw;
  if (raw instanceof ArrayBuffer) return Buffer.from(raw).toString("utf8");
  if (Array.isArray(raw)) return Buffer.concat(raw).toString("utf8");
  return raw.toString("utf8");
}
