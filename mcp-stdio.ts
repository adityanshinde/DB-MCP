import { StdioServerTransport } from './mcp-sdk-runtime.mjs';

import { loadLocalEnv } from './lib/runtime/loadLocalEnv';
import { installProcessGuards } from './lib/runtime/processGuards';

const projectRoot = loadLocalEnv();
if (process.cwd() !== projectRoot) {
  process.chdir(projectRoot);
}

installProcessGuards();

async function main(): Promise<void> {
  // Import after .env is loaded — lib/config.ts reads process.env at module init.
  const { createMcpServer } = await import('./lib/mcp/createMcpServer');
  const server = createMcpServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((error) => {
  console.error('[mcp-stdio] Fatal error:', error);
  process.exitCode = 1;
});