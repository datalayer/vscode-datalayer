# webview/services/loro/ - Loro CRDT Collaboration

Loro CRDT integration for real-time collaborative editing on Lexical documents. Adapts Loro's collaboration protocol to work through VS Code's webview postMessage channel.

## Files

- **vsCodeLoroProvider.ts** - VS Code Loro provider implementation. Uses postMessage to communicate with the extension's WebSocket adapter for CRDT synchronization. Bridges the webview-side Loro state with the server-side collaboration session.
- **providerFactory.ts** - Provider factory creating VS Code Loro providers. Implements the factory interface expected by `LoroCollaborationPlugin` in `@datalayer/jupyter-lexical`.
- **awarenessAdapter.ts** - Awareness adapter wrapping Loro's EphemeralStore to provide presence/awareness functionality (cursor positions, user info) for collaborative editing sessions.
