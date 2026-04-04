# src/chat/ - Copilot Chat Integration

Integration with VS Code's Copilot Chat for interactive AI assistance with Datalayer documents.

## Files

- **chatContextProvider.ts** - Registers a chat context provider that automatically makes notebook and lexical document content available to Copilot Chat when files are open in the editor.
- **datalayerChatParticipant.ts** - Chat participant providing interactive assistance with tool invocation for working with Jupyter notebooks and Lexical documents. Integrates with VS Code's language model API.
