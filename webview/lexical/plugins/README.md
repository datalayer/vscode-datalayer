# webview/lexical/plugins/ - Lexical Editor Plugins

Lexical editor plugins extending editor functionality. Each plugin registers with the Lexical editor and handles specific features.

## Files

- **CommandHandlerPlugin.tsx** - Listens to format commands from the VS Code toolbar (via `lexicalCommands` event emitter) and dispatches the appropriate Lexical editor commands (bold, italic, heading changes, etc.).
- **InternalCommandsPlugin.tsx** - Handles internal command messages from the extension for tool operations. Executes block CRUD operations on the Lexical editor using Runner pattern and DefaultExecutor. This is how MCP tools manipulate the editor.
- **NavigationPlugin.tsx** - Handles navigation to outline items by scrolling to the target node and positioning the cursor at the beginning. Triggered when user clicks an item in the outline tree view.
- **OutlinePlugin.tsx** - Extracts and sends outline data to the extension using the `useLexicalOutline` hook. Keeps the outline tree view in sync with editor content.
- **ContextMenuPlugin.tsx** - Shows an "Add Comment" context menu option when text is selected via right-click.
