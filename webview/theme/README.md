# webview/theme/ - VS Code Theme Integration

Theme providers and utilities mapping VS Code CSS variables to component library themes (Primer React, CodeMirror).

## Files

- **VSCodeTheme.tsx** - VS Code theme integration for Jupyter React components. Uses VS Code CSS variables directly without complex mappings. Includes `VSCodeCSSInjector` component that injects theme overrides into the DOM.
- **PrimerVSCodeTheme.tsx** - Primer React ThemeProvider wrapper configured with VS Code color mode detection. Ensures Primer components follow VS Code's light/dark/high-contrast theme.
- **primerColorMappings.ts** - Maps VS Code CSS variables to Primer color tokens organized by semantic categories (canvas, fg, border, accent, success, danger, etc.) matching Primer's design token structure.
- **utils.ts** - Utility functions for theme color manipulation: `getCSSVariable()`, `rgbaToHex()`, `withOpacity()`, and `getVSCodeColorAsHex()` for reading and converting VS Code theme colors at runtime.
