# MCP client setup (copy-paste)

Hosted DB-MCP speaks **HTTP** at `https://<your-deployment>/api/mcp`. Editors such as Cursor only support **stdio** MCP out of the box, so users run the official bridge **[mcp-remote](https://www.npmjs.com/package/mcp-remote)** and pass your URL plus the same header you would send to HTTP.

You only customize **two values**:

1. **`REPLACE_WITH_YOUR_ORIGIN`** — Deployment origin with **no** trailing slash, e.g. `https://db-mcp-xxxx.vercel.app`.
2. **`REPLACE_WITH_TOKEN_FROM_POST_API_CREDENTIALS`** — Raw token returned from `POST /api/credentials` (the JSON field `data.token`). Keep the `Bearer ` prefix in `DB_MCP_AUTH`.

Merge the snippet from **`mcp-remote-cursor.json`** into your MCP config:

| App | Config file |
|-----|--------------|
| Cursor | `~/.cursor/mcp.json` or project `.cursor/mcp.json` |
| Claude Desktop | `%APPDATA%\Claude\claude_desktop_config.json` (Windows), `~/Library/Application Support/Claude/claude_desktop_config.json` (macOS) |

On Windows, if `npx` fails from the IDE, set `"command"` to the full path to `npx.cmd`, e.g. `C:\\Program Files\\nodejs\\npx.cmd`.

### HTTP-only clients (simplest)

If a product offers **remote MCP URL + API key / bearer** in the UI (no `mcp-remote`), use:

- **URL:** `https://<your-origin>/api/mcp`
- **Header:** `Authorization: Bearer <token>`

Same token as above.

### Preview deployments on Vercel

If the deployment uses **Deployment Protection**, browsers and CLI must authenticate to Vercel before `/api/mcp` is reachable. Use a production URL without protection, disable protection for previews, or follow [Vercel bypass automation](https://vercel.com/docs/deployment-protection/methods-to-bypass-deployment-protection/protection-bypass-automation).
