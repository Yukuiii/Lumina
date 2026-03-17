import { createGatewayServer } from "./server";

/**
 * 启动 Gateway 服务进程。
 */
async function main(): Promise<void> {
  const server = createGatewayServer();

  const host = process.env.HOST ?? "127.0.0.1";
  const port = Number(process.env.PORT ?? "8787");

  try {
    await server.listen({ host, port });
    server.log.info({ host, port }, "Gateway 已启动");
  } catch (error) {
    server.log.error(error, "Gateway 启动失败");
    process.exitCode = 1;
  }
}

void main();
