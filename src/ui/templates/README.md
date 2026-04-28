# src/ui/templates/ - Webview HTML Templates

HTML template generators for webview panels with CSP nonces, theme integration, and script loading.

## Files

- **notebookTemplate.ts** - Generates HTML for the notebook editor webview including VS Code theme integration, CSP nonces, Pyodide loading, and cache-busting timestamps.
- **datasourceTemplate.ts** - Generates HTML for the datasource creation dialog with Primer theme CSS and Content Security Policy.
- **datasourceEditTemplate.ts** - Generates HTML for the datasource edit dialog with Primer theme CSS and CSP headers.
- **agentChatTemplate.ts** - Generates HTML for the Datalayer Agent Chat sidebar webview view. Loads `dist/agentChat.js` under a strict CSP with a nonce, inlines the Primer-on-VS-Code theme CSS, and wires `#root` for the React app hosted by `AgentChatViewProvider`.
