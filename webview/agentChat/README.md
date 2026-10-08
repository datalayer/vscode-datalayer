# `webview/agentChat/`

React webview that renders the Datalayer Agent Chat sidebar
(`datalayerAgentChatView`). Wraps `@datalayer/agent-runtimes`'s `<Chat>`
component, injects a Primer `ThemeProvider` that tracks the editor's
colour mode, and tunnels every outgoing HTTP/WebSocket call through the
extension host so CORS and auth never get in the way.

## Files

- [index.tsx](./index.tsx) - Webview entry point. Installs the global
  `fetch`/`WebSocket` network bridge before any lazy-loaded `<Chat>` code
  runs (ESM imports above this line are already evaluated, but none of
  them touch `fetch`/`WebSocket` at module-eval time — see the inline
  comment in `index.tsx` for the load-order contract). Acquires the VS
  Code webview API, creates the typed SDK bridge transport, and mounts
  `<App>`. Listens for `theme-change`, `auth-state`, `chat-settings`, and
  `chat-agents` messages from the extension host and re-renders the React
  tree.
- [App.tsx](./App.tsx) - Top-level React component. Wraps the tree with
  Primer's `ThemeProvider` + `BaseStyles` (required by `ActionMenu`
  portals inside `<Chat>`), handles the "not signed in" / "no agents" /
  loading states, auto-selects when exactly one runtime is available, and
  hands off to a lazy-loaded `<Chat>` from `@datalayer/agent-runtimes`
  wrapped in `<AgentRuntimesClientProvider client={bridgeClient}>`.
- [AppChat.tsx](./AppChat.tsx) - A deployed application's agent (STUDIO
  A-18), lazy-loaded when one is picked under _Your applications_: reads
  its Appspec from Spacer, refuses one that takes only a signed user
  (D-21), then mounts `<Chat protocol="ag-ui">` on the session API's
  `<kept runtime>/api/v1/apps/agents/<agent>/ag-ui/`, with its pending
  Tool Approvals (polled from ai-agents, answered in the banner), the
  `host_context` tool answered with the editor's open file when the
  Appspec lets it (D-10), and the transcript's lines under the chat
  (A-06). Every request goes through the network bridge; the extension
  host signs the allowed ones with the person's token, which the view
  never holds. Pure logic in
  [`src/chat/appChat.ts`](../../src/chat/appChat.ts).
- [bridgeClient.ts](./bridgeClient.ts) - `BridgeAgentRuntimesClient`
  implements the 22-method `IAgentRuntimesClient` surface by posting
  typed RPC envelopes to the extension host. Used for keyring-scoped
  control-plane operations (listing runtimes, creating agents,
  notifications, events, evals, output artifacts, context/cost usage,
  runtime lifecycle). Chat runtime endpoints (config, history, sandbox
  status, skills, tool-approval streams, etc.) are tunneled through the
  raw network bridge instead.
- [networkBridge.ts](./networkBridge.ts) - `installNetworkBridge` replaces
  `window.fetch` and `window.WebSocket` with proxies that tunnel every
  non-local call through `postMessage` so the Node.js extension host can
  open the real connection without CORS. Supports SSE-style streaming
  responses (`ReadableStream` body) and bidirectional WebSocket traffic.

## Bundling

Webpack emits this entry as `dist/agentChat.js` via `agentChatWebviewConfig`
in [`webpack.config.js`](../../webpack.config.js). The bundle is loaded into
a `vscode.WebviewView` by
[`AgentChatViewProvider`](../../src/providers/agentChatViewProvider.ts),
registered against the `datalayerAgentChatView` view inside the
`datalayerChat` activity-bar container.

## Runtime ingress rewriting

The platform's `listRuntimes` returns an ingress URL that points at the
Jupyter server (`/jupyter/server/...`). The agent-runtimes REST API and
streaming chat endpoints instead live on a sibling path
(`/agent-runtimes/...`) on the same host. `AgentChatViewProvider`
rewrites the ingress before handing it to the webview so every call
(`/api/v1/configure`, `/api/v1/history`, `/api/v1/vercel-ai/<agentId>`,
etc.) resolves to the real agent runtime.

## Extension-host counterparts

- [`src/bridges/agentChatBridge.ts`](../../src/bridges/agentChatBridge.ts)
  — answers typed `IAgentRuntimesClient` RPCs.
- [`src/bridges/agentChatNetworkBridge.ts`](../../src/bridges/agentChatNetworkBridge.ts)
  — answers raw `net.fetch.*` / `net.ws.*` envelopes produced by the
  `installNetworkBridge` overrides.
