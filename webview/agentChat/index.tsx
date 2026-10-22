/*
 * Copyright (c) 2021-2025 Datalayer, Inc.
 *
 * MIT License
 */

/**
 * The Datalayer Chat's entry: the network bridge first, the page after.
 *
 * ESM evaluates a module's imports before its own statements, so a page
 * that installed the bridge in its body ran every static import — and
 * whatever captured `window.fetch` at module-eval time — on the real
 * globals, which the webview's Content Security Policy then blocked. Here
 * nothing but the bridge is imported statically; the page (`./main`) and
 * all it imports arrive by `import()`, once the bridge is in place.
 *
 * Webpack emits this entry as `dist/agentChat.js` (`agentChatWebviewConfig`
 * in `webpack.config.js`); `AgentChatViewProvider` loads it in the
 * `datalayerAgentChatView` view of the `datalayerChat` activity-bar
 * container. Its extension-host counterparts are `AgentChatBridgeHandler`
 * (the typed client's requests) and `AgentChatNetworkBridge` (the
 * `net.fetch.*` and `net.ws.*` envelopes of the network bridge).
 *
 * @module webview/agentChat/index
 */

// Tell webpack which nonce to use for the <script> tags of the chunks it
// loads — this page's own `import("./main")` first, then React.lazy's —
// before any is asked for: the webview's CSP refuses a script without it.
// The value is set by the HTML template before this bundle executes.
// eslint-disable-next-line @typescript-eslint/naming-convention, camelcase
declare let __webpack_nonce__: string | undefined;
// eslint-disable-next-line @typescript-eslint/naming-convention, camelcase, prefer-const
__webpack_nonce__ = (window as unknown as { __webpack_nonce__?: string })
  .__webpack_nonce__;

import { installNetworkBridge } from "./networkBridge";
import { vscode } from "./vscodeApi";

installNetworkBridge(vscode);

void import("./main");
