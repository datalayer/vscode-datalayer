# webview/components/ - Shared React Components

Reusable React components shared between notebook and lexical editors.

## Files

- **RuntimeProgressBar.tsx** - Progress bar showing remaining runtime credits with color transitions (blue to yellow to red) based on time remaining. Provides visual urgency as runtime approaches expiration.
- **notebookStyles.ts** - Centralized CSS configuration for notebook cells and container styling. Eliminates duplicate style definitions and includes JupyterLab notebook container styling with VS Code theme integration.
- **index.ts** - Export barrel for shared components.

## Subdirectories

- **dialogs/** - Modal dialog components (link insertion, YouTube embedding)
- **toolbar/** - Toolbar infrastructure (buttons, dropdowns, overflow menus, kernel selector)
