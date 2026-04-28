# `src/bridges/` - Extension-Host Webview Bridges

Bridge handlers that sit in the extension host and translate `postMessage`
envelopes from webviews into real method calls on Datalayer SDK instances.
They are the counterpart to webview-side clients that implement domain
interfaces by posting bridge messages instead of making direct HTTP calls.

## Why

VS Code webviews run inside a sandbox that cannot (reliably) reach the
Datalayer platform over HTTP/WebSocket, and even when they can they do not
hold the auth token. The extension host does. A bridge pattern lets a
webview depend on a domain interface (e.g. `IAgentRuntimesClient` from
`@datalayer/agent-runtimes`) while the concrete network work happens in
the extension host under the user's credentials.

## Files

- **agentChatBridge.ts** - `AgentChatBridgeHandler` answers requests from the
  Datalayer Agent Chat webview (`webview/agentChat/`). It wraps the shared
  `ExtendedDatalayerClient` in a `SdkAgentRuntimesClient` from
  `@datalayer/agent-runtimes` and dispatches whitelisted method calls from
  the webview to the SDK. Typed request/response surface (22 methods from
  `IAgentRuntimesClient`).
- **agentChatNetworkBridge.ts** - `AgentChatNetworkBridge` answers raw
  `net.fetch.*` and `net.ws.*` messages from the webview. Agent-runtimes
  contains many components and protocol adapters that issue direct
  `fetch()` / `new WebSocket()` calls to the runtime ingress; these would
  fail from the `vscode-webview://` origin due to CORS. The webview-side
  `installNetworkBridge` (see `webview/agentChat/networkBridge.ts`)
  transparently overrides `window.fetch` and `window.WebSocket` and
  tunnels every call through `postMessage`; this handler opens the real
  HTTP/WebSocket from Node (no CORS) and relays streaming response chunks
  and WebSocket events back to the webview.

## Two layers, one chat

The Agent Chat webview talks to two distinct bridges:

1. **Typed SDK bridge** (`agentChatBridge.ts`) - for operations that need
   the user's Datalayer auth token from the OS keyring (listing agents,
   creating runtimes, keyring-scoped SDK calls).
2. **Raw network bridge** (`agentChatNetworkBridge.ts`) - for every direct
   HTTP/WS the upstream `@datalayer/agent-runtimes` package issues with a
   runtime token it already has. Catches all endpoints the typed surface
   does not cover (chat streaming, protocol adapters, MCP status, etc.).
