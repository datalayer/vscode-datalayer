# webview/components/toolbar/ - Toolbar Infrastructure

Shared toolbar components used by both notebook and lexical editors for consistent VS Code-native appearance.

## Files

- **BaseToolbar.tsx** - Generic toolbar component with priority-based action overflow handling and left/right content areas. Matches VS Code's native toolbar appearance and automatically collapses low-priority actions into overflow menu when space is limited.
- **ToolbarButton.tsx** - Reusable toolbar button with VS Code native styling. Supports icons (codicons), labels, loading spinners, disabled states, and tooltips.
- **Dropdown.tsx** - VS Code-native dropdown for toolbar menus with icon display, keyboard shortcut labels, and divider support between groups.
- **OverflowMenu.tsx** - Generic overflow menu that collects toolbar actions that don't fit the available width into a "more actions" dropdown.
- **KernelSelector.tsx** - Shared kernel selector button displayed on the right side of the toolbar. Shows the connected runtime name with a loading spinner during kernel initialization.
- **index.ts** - Export barrel for toolbar components.
