# src/chat/ - Copilot Chat Integration

Integration with VS Code's Copilot Chat for interactive AI assistance with Datalayer documents.

## Files

- **chatContextProvider.ts** - Registers a chat context provider that automatically makes notebook and lexical document content available to Copilot Chat when files are open in the editor.
- **datalayerChatParticipant.ts** - Chat participant providing interactive assistance with tool invocation for working with Jupyter notebooks and Lexical documents. Integrates with VS Code's language model API.
- **appChat.ts** - A deployed application's agent in the Agent Chat sidebar (STUDIO A-18), pure (no `vscode`, no React, no network): the picker's choices from ai-agents' deployments (`deploymentChoicesOf`), the session API's AG-UI route (`agUiEndpoint`), the Appspec's host terms (`appHostOf`, `signedRefusal`, `editorContextRefusal`), the `host_context` tool answered with the editor's open file (`hostContextTool`), the transcript's lines (`toolLineOf`), pending approvals (`pendingApprovalsOf`) and the URL prefixes the extension host signs for the view (`signedPrefixesOf`, `signsRequest`). Imported by `providers/agentChatViewProvider.ts` and `webview/agentChat/AppChat.tsx`; tested by `webview/test/appChat.test.ts` (vitest).
