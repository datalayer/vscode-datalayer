# webview/theme/ - The editor's theme

The extension's views are drawn in Datalayer's `vscode` theme, a theme
variant of `@datalayer/primer-addons` whose every token reads the editor's
own `--vscode-*` variable. A webview is therefore drawn in the colour theme
VS Code has, and follows it the moment the person picks another: VS Code
rewrites the variables, the browser resolves them at paint time, nothing
re-renders. The light/dark mode is the editor's, sent to each webview as
`theme-change` and passed down from its root.

The theme's colours, type (the editor's font and size), shape (2px corners,
26px controls, flat, no motion), focus ring, the JupyterLab variables,
CodeMirror's selection and Excalidraw's palette all live in primer addons
(`src/theme/themes/vscodeThemeStyles.ts`, `vscodeEditorsCss.ts`,
`src/theme/colors/vscodeColors.ts`). Nothing is mapped here.

## Files

- **PrimerVSCodeTheme.tsx** - `DatalayerThemeProvider` with the `vscode`
  theme, in the editor's colour mode. Around every view built of Primer
  components (the Datalayer chat, the home page, the datasource dialogs, the
  showcase). Portals (menus, dialogs) are themed by the provider too.
- **DatalayerVSCodeTheme.tsx** - the same, with jupyter-react's provider inside
  it, for the views that hold Jupyter components (the notebook, the
  document). jupyter-react loads Primer's primitive colours, so the theme's
  variables are laid inline on its box, where nothing beats them — the one
  thing primer addons cannot do by itself, as it knows no jupyter-react.
