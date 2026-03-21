import { loadConfig } from "./config";
import { createGatewayServer } from "./server";

/**
 * 启动 Gateway 服务进程。
 */
async function main(): Promise<void> {
  try {
    const config = loadConfig();
    const server = createGatewayServer(config);

    await server.listen({ host: config.host, port: config.port });

    if (config.llm) {
      server.log.info(
        { host: config.host, port: config.port, llm: `${config.llm.provider} ${config.llm.model} @ ${config.llm.baseUrl}` },
        "Gateway 已启动"
      );
    } else {
      server.log.warn(
        { host: config.host, port: config.port },
        "Gateway 已启动（LLM 未配置，请通过桌面端设置面板或环境变量配置后再发消息）"
      );
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`Gateway 启动失败：${message}`);
    process.exitCode = 1;
  }
}

void main();
