# webview/contexts/ - React Context Providers

React context providers for shared state across the webview component tree.

## Files

- **ThemeContext.tsx** - Theme provider component that re-exports ThemeContext from `@datalayer/jupyter-lexical` and makes the VS Code theme available to all child components. Bridges VS Code's theme system with the Lexical editor's theme requirements.
