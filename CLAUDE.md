# Datalayer VS Code Extension - Developer Guide

## Quick Start

```bash
# Setup
npm install
npm run watch

# Debug
Press F5 in VS Code to launch Extension Development Host

# Build & Package
npm run compile
npm run vsix

# Production Build (Electron Desktop App)
# From desktop directory:
npm run build
npm run dist:mac  # Builds universal macOS app
# Note: Post-build script automatically fixes CSS import issues
```

## Architecture Overview

- **Extension Context** (`src/`): Node.js environment, handles auth & server communication
- **Webview** (`webview/`): React-based notebook editor with VS Code theme integration
- **Message Passing**: JWT token injection between extension and webview

## Key Features

### 🎨 VS Code Theme Integration

- **Complete theme matching**: Notebook cells match VS Code colors exactly
- **Syntax highlighting**: CodeMirror uses VS Code syntax colors via post-build patching
- **Background harmony**: No visual gaps, proper color inheritance
- **Native toolbar**: VS Code-style with codicon icons

**Implementation**: Enhanced theme provider (`webview/theme/`) automatically injects CSS overrides. Post-build script (`packages/react/scripts/patch-vscode-highlighting.js`) patches NotebookAdapter with VS Code syntax highlighting.

### 🔐 Authentication System

- Token-based login with Datalayer platform
- GitHub profile enrichment for OAuth users
- Secure storage via VS Code SecretStorage API
- Status bar integration with connection state

### 📁 Spaces Tree View

- Hierarchical display of Datalayer spaces and documents
- Virtual file system for clean paths (`datalayer:/Space/doc.lexical`)
- Create, rename, delete documents with API sync
- Context menu actions for document management

### 📝 Lexical Editor

- Rich text editing for `.lexical` documents
- Full formatting support (bold, italic, lists, headings)
- Read-only mode for Datalayer documents
- VS Code theme integration

### ⚙️ Runtime Management

- Automatic runtime creation and reuse
- Credits conservation through runtime sharing
- Health verification before reuse
- Configurable environments (`python-cpu-env`, `ai-env`)

## Configuration

```json
{
  "datalayer.serverUrl": "https://prod1.datalayer.run",
  "datalayer.runtime.environment": "python-cpu-env",
  "datalayer.runtime.creditsLimit": 10
}
```

## API Response Handling

Spacer API returns wrapped responses:

```json
{
  "success": true,
  "message": "...",
  "runtimes": [...] // or "kernel" for single runtime
}
```

Key field mappings:

- Runtime URL: Use `ingress` (not `jupyter_base_url`)
- Runtime token: Use `token` (not `jupyter_token`)
- Single runtime: Check `kernel` field (not `runtime`)

## CI/CD Workflows

Four separate GitHub Actions workflows:

1. **VSCode - Extension Build & Test**: Multi-platform builds with .vsix artifacts
2. **VSCode - Code Quality**: Linting and formatting checks (Ubuntu only)
3. **VSCode - Type Check**: TypeScript compilation verification (Ubuntu only)
4. **VSCode - Documentation**: TypeDoc HTML/Markdown generation

All trigger on `/packages/vscode/**` changes to main branch only.

## Commands

Key commands:

- `datalayer.login`: Authenticate with Datalayer
- `datalayer.logout`: Sign out
- `datalayer.showAuthStatus`: View auth status
- `datalayer.refreshSpaces`: Refresh tree view
- `datalayer.createNotebookInSpace`: Create notebook in space
- `datalayer.createLexicalInSpace`: Create lexical doc in space
- `datalayer.renameItem`: Rename document
- `datalayer.deleteItem`: Delete document

## API Endpoints

### Spacer API (Documents)

- `/api/spacer/v1/spaces/users/me` - Get user's spaces
- `/api/spacer/v1/spaces/{id}/items` - Get space items
- `/api/spacer/v1/notebooks` - Create notebooks (multipart/form-data)
- `/api/spacer/v1/lexicals` - Create lexical docs (multipart/form-data)

### Runtimes API

- `/api/runtimes/v1/runtimes` - List runtimes (GET)
- `/api/runtimes/v1/runtimes` - Create runtime (POST)

## Project Structure

```
src/
├── auth/           # Authentication services
├── spaces/         # Spaces tree view & API
├── editors/        # Custom editors (notebook, lexical)
└── runtimes/       # Runtime management

webview/
├── theme/          # VS Code theme integration
├── NotebookVSCode.tsx    # Main notebook component
├── NotebookToolbar.tsx   # VS Code-style toolbar
└── LexicalEditor.tsx     # Rich text editor
```

## Development Guidelines

### Code Quality

```bash
npm run lint        # ESLint
npx tsc --noEmit   # Type checking
npm run doc        # Documentation
```

### Important Notes

- **NO EMOJIS** in code, comments, or documentation
- Always check for existing runtimes before creating new ones
- Use actual API field names (e.g., `ingress` not `jupyter_base_url`)
- Maintain JSDoc comments for all exported functions
- Use FormData for notebook/lexical creation, JSON for other endpoints

### Notebook Cell Management

**Adding Cells**: Use `NotebookActions` directly from `@jupyterlab/notebook`:

```typescript
import { NotebookActions } from "@jupyterlab/notebook";

// ✅ CORRECT - Use NotebookActions directly
const notebookWidget =
  notebook?.adapter?.widget || notebook?.adapter?._notebookPanel?.content;
const sessionContext =
  notebook?.adapter?.sessionContext ||
  notebook?.adapter?._notebookPanel?.context?.sessionContext;

if (notebookWidget) {
  // Add code cell
  NotebookActions.insertBelow(notebookWidget);
  NotebookActions.changeCellType(notebookWidget, "code");

  // Add markdown cell
  NotebookActions.insertBelow(notebookWidget);
  NotebookActions.changeCellType(notebookWidget, "markdown");
}

if (notebookWidget && sessionContext) {
  // Run all cells
  NotebookActions.runAll(notebookWidget, sessionContext);
}

// ❌ INCORRECT - Commands and store methods don't work in VS Code extension context
notebook.adapter.commands.execute("notebook-cells:insert-below", {
  cellType: "code",
});
notebookStore.insertBelow({ id: notebookId, source: "", cellType: "code" });
```

**Key NotebookActions Methods**:

- `NotebookActions.insertBelow(widget)` - Insert cell below current position
- `NotebookActions.insertAbove(widget)` - Insert cell above current position
- `NotebookActions.changeCellType(widget, cellType)` - Change cell type ('code' | 'markdown' | 'raw')
- `NotebookActions.runAll(widget, sessionContext)` - Run all cells in the notebook
- `NotebookActions.run(widget, sessionContext)` - Run current cell

This approach bypasses the problematic command registry and uses the same low-level actions that the working JupyterLab commands use internally.

## Troubleshooting

### Common Issues

1. **Icons not showing**: Check codicon font loading in notebookEditor.ts
2. **Theme not matching**: Verify VSCodeThemeProvider is active
3. **Syntax highlighting missing**: Check patch-vscode-highlighting.js ran during build
4. **Black backgrounds**: Enhanced theme provider should inject CSS fixes
5. **Add Cell buttons not working**: Import `NotebookActions` from `@jupyterlab/notebook` and use `NotebookActions.insertBelow()` + `NotebookActions.changeCellType()` instead of store/command methods
6. **Run All button not working**: Use `NotebookActions.runAll(widget, sessionContext)` instead of store or command methods
7. **Notebook widget not accessible**: Check `notebook?.adapter?.widget` or `notebook?.adapter?._notebookPanel?.content` for the JupyterLab widget
8. **Module specifier error for @primer/react-brand CSS**:
   - Error: `Failed to resolve module specifier "@primer/react-brand/lib/css/main.css"`
   - Fix: Run post-build script to remove problematic CSS imports from bundled JS files
   - The fix-production-bundle.js script automatically handles this during build

### Debug Commands

- View authentication status: "Datalayer: Show Authentication Status"
- Refresh spaces: "Datalayer: Refresh Spaces"
- Check console for runtime creation logs

## Recent Improvements

- ✅ Complete VS Code theme integration with syntax highlighting
- ✅ Native toolbar with codicon icons
- ✅ Background color harmony (no black gaps)
- ✅ Cell backgrounds matching VS Code notebook colors
- ✅ Comprehensive TypeDoc documentation
- ✅ Four separate CI/CD workflows for quality assurance
- ✅ Virtual file system for Datalayer documents
- ✅ Production build CSS import fix for @primer/react-brand
- ✅ Post-build script to remove problematic module specifiers

## Version

Current: 0.0.2
VS Code requirement: ^1.98.0
Node.js: >= 20.0.0
