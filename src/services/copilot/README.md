# src/services/copilot/ - Copilot Context Provider

Provides editor context to GitHub Copilot via real filesystem files.

## Files

- **realFileContextProvider.ts** - Creates a real filesystem file that updates with current editor context so Copilot can analyze which files are being edited. Auto-updates when switching between editors.
