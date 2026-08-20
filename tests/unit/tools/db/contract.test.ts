import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

import { DB_TOOL_NAMES, LEGACY_DB_TOOL_NAMES } from '../../../helpers/dbToolNames';

const routeSource = readFileSync(resolve(process.cwd(), 'app/api/mcp/route.ts'), 'utf8');
const serverSource = readFileSync(resolve(process.cwd(), 'lib/mcp/createMcpServer.ts'), 'utf8');

describe('database tool contracts', () => {
  it('registers every database tool in the MCP server', () => {
    for (const tool of DB_TOOL_NAMES) {
      expect(serverSource).toContain(`'${tool}'`);
      expect(serverSource).toContain('server.registerTool(');
    }
  });

  it('keeps legacy dispatch cases for supported database tools', () => {
    for (const tool of LEGACY_DB_TOOL_NAMES) {
      expect(routeSource).toContain(`case '${tool}':`);
    }
  });

  it('exports database tools from lib/tools/db/index.ts', () => {
    const indexSource = readFileSync(resolve(process.cwd(), 'lib/tools/db/index.ts'), 'utf8');
    expect(indexSource).toContain("from './listTables'");
    expect(indexSource).toContain("from './getNl2sqlContext'");
    expect(indexSource).toContain("from './runQuery'");
  });
});
