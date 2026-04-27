# src/mcp

HTTP MCP (Model Context Protocol) server that exposes all Datalayer tools to Windsurf/Cascade.

## Files

- **`mcpServer.ts`** — `startMcpServer()` entry point. Creates an HTTP server on `localhost:3333` (or the next available port) that implements the MCP Streamable HTTP transport. Registers all 22 Datalayer tools using the same `getCombinedOperations()` registry that the VS Code LM adapter uses for Copilot. Differences from the Copilot path: no VS Code Quick Pick dialogs; `createNotebook`/`createLexical` default to cloud when authenticated, local otherwise.

## Windsurf Configuration

Add to `~/.codeium/windsurf/mcp_config.json`:

```json
{
  "mcpServers": {
    "datalayer": {
      "serverUrl": "http://localhost:3333/mcp"
    }
  }
}
```

The actual port is logged to the Datalayer output channel on activation (search for "MCP HTTP server").
