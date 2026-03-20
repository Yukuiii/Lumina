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
    server.log.info(
      { host: config.host, port: config.port, llm: `${config.llm.provider} ${config.llm.model} @ ${config.llm.baseUrl}` },
      "Gateway 已启动"
    );
  } catch (error) {
    // loadConfig 校验失败或 server.listen 绑定失败都在这里捕获。
    const message = error instanceof Error ? error.message : String(error);
    console.error(`Gateway 启动失败：${message}`);
    process.exitCode = 1;
  }
}

void main();
