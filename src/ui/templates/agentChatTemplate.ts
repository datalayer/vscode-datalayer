/*
 * Copyright (c) 2021-2025 Datalayer, Inc.
 *
 * MIT License
 */

/**
 * HTML template for the Datalayer Agent Chat webview view.
 *
 * @module ui/templates/agentChatTemplate
 */

import * as vscode from "vscode";

import { getNonce } from "../../utils/webviewSecurity";
import { getPrimerVSCodeThemeCSS } from "../styles/primerVSCodeTheme";

/**
 * Generates the HTML content for the Agent Chat webview view, wiring up the
 * compiled `dist/agentChat.js` bundle with a strict CSP and a nonce.
 *
 * The CSP `connect-src` directive is restricted to the webview's own
 * `cspSource`. The embedded `<Chat>` component never reaches the
 * Datalayer runtime ingress directly: `webview/agentChat/networkBridge.ts`
 * installs `fetch` / `WebSocket` overrides that tunnel every outbound
 * call through `postMessage` to the extension host, which opens the
 * real connection on the webview's behalf. Tightening `connect-src`
 * means a compromised script can't bypass the bridge and POST the
 * per-runtime token to an attacker-controlled HTTPS host directly.
 *
 * @param webview - Webview instance used to build secure resource URIs.
 * @param extensionUri - Extension root URI for resolving bundled script paths.
 *
 * @returns Complete HTML string to assign to the webview's `html` property.
 */
export function getAgentChatHtml(
  webview: vscode.Webview,
  extensionUri: vscode.Uri,
): string {
  const scriptUri = webview.asWebviewUri(
    vscode.Uri.joinPath(extensionUri, "dist", "agentChat.js"),
  );

  const nonce = getNonce();

  // `connect-src` is intentionally restricted to `webview.cspSource`.
  // The webview installs a `fetch()` / `WebSocket` bridge in
  // `networkBridge.ts` that tunnels every outbound network call through
  // `postMessage` to the extension host — the host opens the real
  // HTTPS / WSS connection on the webview's behalf. The webview itself
  // therefore never needs `https:`/`wss:` in `connect-src`. Removing
  // them shrinks the data-leak surface: a compromised script can't
  // bypass the bridge and POST the per-runtime token directly to an
  // attacker-controlled HTTPS host.
  //
  // (Loading bundled scripts/styles from disk goes through
  // `webview.cspSource`, which is already covered.)
  const connectSrc = webview.cspSource;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Security-Policy"
    content="default-src 'none';
    style-src ${webview.cspSource} 'unsafe-inline';
    script-src 'nonce-${nonce}';
    img-src ${webview.cspSource} https: data:;
    font-src ${webview.cspSource} data:;
    connect-src ${connectSrc};">
  <title>Datalayer Agent Chat</title>
  <style>
    html, body {
      margin: 0;
      padding: 0;
      width: 100%;
      height: 100%;
      font-family: var(--vscode-font-family);
      font-size: var(--vscode-font-size);
      color: var(--vscode-foreground);
      background-color: var(--vscode-editor-background);
      overflow: hidden;
    }

    #root {
      width: 100%;
      height: 100%;
    }

    ${getPrimerVSCodeThemeCSS()}
  </style>
</head>
<body>
  <div id="root"></div>
  <script nonce="${nonce}">
    // Expose the CSP nonce so webpack can apply it to dynamically created
    // <script> tags when loading async chunks (React.lazy code splitting).
    window.__webpack_nonce__ = '${nonce}';

    // Guard WebSocket constructor: wrap in try-catch so invalid URLs
    // (e.g. relative URLs resolving against vscode-webview:// origin)
    // return a no-op stub instead of throwing and crashing the React tree.
    // Uses Reflect.construct to preserve native constructor context.
    (function() {
      var _WS = window.WebSocket;
      window.WebSocket = function WebSocket(url, protocols) {
        try {
          return (protocols !== undefined)
            ? Reflect.construct(_WS, [url, protocols], _WS)
            : Reflect.construct(_WS, [url], _WS);
        } catch (_) {
          console.warn('[AgentChat] WebSocket blocked:', url);
          // Minimal no-op stub assigned to 'this' (returned by 'new').
          this.readyState = 3;
          this.url = typeof url === 'string' ? url : '';
          this.bufferedAmount = 0;
          this.extensions = '';
          this.protocol = '';
          this.binaryType = 'blob';
          this.onopen = null;
          this.onerror = null;
          this.onclose = null;
          this.onmessage = null;
          this.send = function() {};
          this.close = function() {};
          this.addEventListener = function() {};
          this.removeEventListener = function() {};
          this.dispatchEvent = function() { return true; };
          var self = this;
          setTimeout(function() {
            if (typeof self.onerror === 'function') self.onerror(new Event('error'));
            if (typeof self.onclose === 'function') self.onclose(new CloseEvent('close', { code: 1006 }));
          }, 0);
        }
      };
      window.WebSocket.prototype = _WS.prototype;
      window.WebSocket.CONNECTING = 0;
      window.WebSocket.OPEN = 1;
      window.WebSocket.CLOSING = 2;
      window.WebSocket.CLOSED = 3;
    })();

    // Global error handler — only show the crash banner if React never
    // mounted. Use addEventListener (not window.onerror = ...) so this
    // composes with any other handler VS Code or future webview scripts
    // install on the same page instead of clobbering them.
    window.addEventListener('error', function(event) {
      var msg = event.message;
      var src = event.filename;
      var line = event.lineno;
      var col = event.colno;
      var err = event.error;
      console.error('[AgentChat] UNCAUGHT:', msg, 'at', src, line, col, err);
      var root = document.getElementById('root');
      if (root && !root.children.length) {
        var pre = document.createElement('pre');
        pre.style.cssText = 'color:red;padding:16px;white-space:pre-wrap;font-size:12px;';
        pre.textContent = 'Agent Chat failed to load:\\n' + msg + '\\nat ' + src + ':' + line + ':' + col
          + (err && err.stack ? '\\n\\n' + err.stack : '');
        root.appendChild(pre);
      }
    });
    window.addEventListener('unhandledrejection', function(e) {
      console.error('[AgentChat] UNHANDLED REJECTION:', e.reason);
    });
  </script>
  <script nonce="${nonce}" src="${scriptUri}"></script>
</body>
</html>`;
}
