# src/config/ - Centralized Configuration

Extension-wide configuration constants and settings.

## Files

- **llmModels.ts** - Centralized LLM model configuration for inline completions. Uses strategy-based model selection trying vendors/families in order of preference (GPT-4, Copilot, any available). Used by both notebook and lexical providers.
