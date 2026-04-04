# src/services/collaboration/ - Real-Time Collaboration

Services for real-time collaborative editing on documents.

## Files

- **lexicalCollaboration.ts** - Configures WebSocket connections and user sessions for real-time collaborative editing on Lexical documents.
- **loroWebSocketAdapter.ts** - Manages real WebSocket connections on the extension side and proxies Loro CRDT collaboration messages to/from the webview.
