# webview/services/completion/ - Inline Completion Providers

Providers for inline code completions (ghost text) in notebook and lexical editors, integrating with VS Code's Language Model API and LSP.

## Files

- **vscodeLLMProvider.ts** - VS Code LLM-powered inline completion provider for notebook cells. Uses the Language Model API (Copilot, GPT-4, etc.) for intelligent code completions displayed as ghost text.
- **lexicalLLMProvider.ts** - VS Code Language Model integration for Lexical editor inline completions. Bridges the webview with the extension host's LLM access via postMessage.
- **lspProvider.ts** - LSP completion provider for Python and Markdown cells. Communicates with the extension host to reach Pylance and Markdown language servers for context-aware completions.
- **lspTabProvider.ts** - LSP Tab completion provider showing dropdown menu completions (triggered by Tab key) with higher rank than the kernel completer.
