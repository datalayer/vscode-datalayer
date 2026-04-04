# webview/lexical/ - Lexical Rich Text Editor

Meta's Lexical framework integration for rich text editing of `.dlex` documents. This is a full-featured editor with formatting, collaboration, and inline completions.

## Files

- **LexicalEditor.tsx** - Main editor component (~983 lines). Configures all Lexical nodes, plugins, and handlers for saving, loading content, keyboard shortcuts, and inline completions. Integrates with VS Code theming and service managers. Supports optional Loro CRDT collaboration.
- **LexicalToolbar.tsx** - Editor toolbar providing rich text formatting controls: text styles, font selection, colors, alignment. Uses shared toolbar components from `components/toolbar/` for consistency with the notebook toolbar.
- **LexicalWebview.tsx** - Main webview component wrapping the editor with runtime manager hook and Zustand state management. Handles document reuse detection and message passing with the extension.
- **main.ts** - Entry point for the lexical webview. Initializes RequireJS stub and configures webpack public path for WASM loading (required by loro-crdt).

## Subdirectories

- **plugins/** - Lexical editor plugins (commands, context menu, navigation, outline, internal tool commands)
- **icons/** - SVG icons for formatting toolbar buttons
