<a href="https://datalayer.io"><img src="https://assets.datalayer.tech/datalayer-25.png" width="150"/></a>

[![Become a Sponsor](https://img.shields.io/static/v1?label=Become%20a%20Sponsor&message=%E2%9D%A4&logo=GitHub&style=flat&color=1ABC9C)](https://github.com/sponsors/datalayer)

## Project Status

[![Build Status](https://github.com/datalayer/vscode-datalayer/actions/workflows/build-extension.yml/badge.svg)](https://github.com/datalayer/vscode-datalayer/actions/workflows/build-extension.yml)
[![Netlify Status](https://api.netlify.com/api/v1/badges/d73cd7a0-952b-405e-9e94-63d00ce01320/deploy-status)](https://app.netlify.com/sites/datalayer-desktop/deploys)
[![Documentation](https://img.shields.io/badge/docs-TypeDoc-blue.svg)](https://vscode-datalayer.netlify.app)
[![VS Code Marketplace](https://img.shields.io/visual-studio-marketplace/v/datalayer.datalayer-vscode-datalayer?label=VS%20Code%20Marketplace&logo=visual-studio-code)](https://marketplace.visualstudio.com/items?itemName=datalayer.datalayer-vscode-datalayer)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

## Built With

[![TypeScript](https://img.shields.io/badge/TypeScript-007ACC?style=flat&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![React](https://img.shields.io/badge/React-61DAFB?style=flat&logo=react&logoColor=black)](https://reactjs.org/)
[![Jupyter](https://img.shields.io/badge/Jupyter-F37626?style=flat&logo=jupyter&logoColor=white)](https://jupyter.org/)

# Datalayer for Visual Studio Code

This [Visual Studio Code](https://code.visualstudio.com) extension enables you to edit and collaborate on [Jupyter](https://jupyter.org) Notebooks (`.ipynb` files) and Lexical documents (`.lexical` files) with seamless integration to the [Datalayer](https://datalayer.io) platform. The extension supports real-time collaborative editing for both document types, allowing multiple users to work together simultaneously. Available in the [VS Code Marketplace](https://marketplace.visualstudio.com/items?itemName=datalayer.datalayer-vscode-datalayer).

<img src="https://jupyter-examples.datalayer.tech/jupyter-react-vscode.gif" />

## 🎨 VS Code Theme Integration

The extension now features **complete VS Code theme integration** for a native development experience:

## Features

- **Notebook Operations**: Load, display, and run Jupyter Notebooks with full kernel support
- **VS Code Theme Integration**: Perfect visual harmony with your VS Code environment
- **Lexical Editor**: Rich text editor with full formatting support for `.lexical` documents
- **Datalayer Authentication**: Token-based authentication with automatic GitHub profile enrichment
- **Server Connectivity**: Connect to Jupyter servers or Datalayer cloud platform
- **Unified Kernel Selection**: Single picker interface for all kernel sources (Datalayer, Python, Jupyter servers)
- **Real-time Execution**: Run code cells with live output and error display
- **IPyWidgets Support**: Full interactive widget support
- **Status Bar Integration**: View connection status and user profile
- **Spaces Tree View**: Browse and manage documents across all your Datalayer spaces
- **Runtime Management**: Automatic creation and reuse of Datalayer runtimes with configurable environments
- **Document Bridge**: Seamless document downloading and local caching for offline viewing
- **Virtual File System**: Clean virtual paths for Datalayer documents (e.g., `datalayer:/Space Name/document.lexical`)

## Notebook Toolbar

The extension provides a VS Code-native toolbar for notebook operations:

### Toolbar Actions

- **▶️ Run Cell**: Execute the currently selected cell
- **⏫ Run All Above**: Execute all cells above the current cell
- **⏬ Run All Below**: Execute all cells below the current cell
- **➕ Insert Cell**: Add new cells above or below
- **🗑️ Clear Outputs**: Clear all cell outputs
- **🔄 Restart Kernel**: Restart the Jupyter kernel
- **⏹️ Interrupt Kernel**: Stop executing cells
- **🎯 Select Kernel**: Choose from Datalayer Platform, Python environments, or existing Jupyter servers

### Kernel Status Indicator

- **🟢 Green**: Kernel idle and ready
- **🟡 Yellow**: Kernel busy executing
- **🔴 Red**: Kernel disconnected or error

The toolbar displays "Datalayer: {Runtime name}" when connected to a Datalayer runtime, making it easy to identify which runtime is currently active.

## Spaces Tree View

The extension provides a tree view in the Explorer sidebar that displays all your Datalayer spaces and documents:

### Features

- **Hierarchical Display**: Shows "Datalayer (@username)" as root, with spaces as folders containing documents
- **Document Types**: Displays notebooks with `.ipynb` extension and documents with `.lexical` extension
- **Default Space**: Marks your default space with "(Default)" label
- **Real-time Updates**: Refreshes when authentication state changes
- **Error Handling**: Shows helpful messages when not authenticated or when spaces are empty
- **Document Creation**: Create notebooks and lexical documents within any space
- **Item Management**: Rename and delete documents with API synchronization

### Tree Structure

```
Datalayer (@username)
├── My Library (Default) [📓] [📄]
│   ├── notebook1.ipynb
│   ├── document1.lexical
│   └── notebook2.ipynb
```

**Legend:**

- `[📓]` - Create new notebook
- `[📄]` - Create new lexical document

### Context Menu Actions

**For Documents:**

- **Open** - Open the document in the editor
- **Rename...** - Change the document name
- **Delete** - Remove the document from the space

**For Spaces:**

- **New Datalayer Notebook...** - Create a new notebook in the space
- **New Lexical Document...** - Create a new lexical document in the space

## Lexical Editor

The extension includes a rich text editor for `.lexical` documents with full formatting capabilities:

### Features

- **Rich Text Formatting**: Bold, italic, underline, strikethrough, and inline code
- **Headings**: H1, H2, H3 support with proper styling
- **Lists**: Bullet points and numbered lists
- **Text Alignment**: Left, center, right alignment options
- **Markdown Shortcuts**: Type markdown syntax for quick formatting
- **Undo/Redo**: Full history management
- **Read-only Mode**: Datalayer documents open in read-only mode for safe viewing
- **VS Code Theme Integration**: Seamlessly matches your VS Code theme

### Document Types

- **Local Files**: Create and edit `.lexical` files locally with full editing capabilities
- **Datalayer Documents**: View lexical documents from Datalayer spaces in read-only mode
- **Virtual Paths**: Datalayer documents show clean paths like `datalayer:/Space Name/document.lexical`

### Commands

- `Datalayer: Create new Datalayer Lexical Document` - Create a new lexical document in your workspace

### Usage

1. **Create New**: Use Command Palette → "Datalayer: Create new Datalayer Lexical Document"
2. **Open from Spaces**: Click any `.lexical` document in the Datalayer Spaces tree view
3. **Local Files**: Open any `.lexical` file from your workspace

## Authentication

The extension supports authentication with the Datalayer platform:

1. **Login**: Use Command Palette (`Cmd+Shift+P`) → "Datalayer: Login to Datalayer"
2. **Token Input**: Paste your Datalayer access token when prompted
3. **Auto-enrichment**: If authenticated via GitHub, your profile information is automatically fetched
4. **Status Display**: View connection status in the status bar with Datalayer icon

### Commands

- `Datalayer: Login to Datalayer` - Authenticate with your Datalayer token
- `Datalayer: Logout from Datalayer` - Sign out and clear stored credentials
- `Datalayer: Show Authentication Status` - View current authentication status
- `Datalayer: Create new Datalayer Notebook` - Create a new notebook file
- `Datalayer: Create new Datalayer Lexical Document` - Create a new lexical document
- `Datalayer: Refresh Spaces` - Refresh the spaces tree view
- `Datalayer: Open Document` - Open a document from the tree view (automatic on click)
- `Datalayer: New Datalayer Notebook...` - Create a new notebook in a selected space
- `Datalayer: New Lexical Document...` - Create a new lexical document in a selected space
- `Datalayer: Create New Space` - Create a new Datalayer space
- `Datalayer: Rename...` - Rename a notebook or lexical document
- `Datalayer: Delete` - Delete a notebook or lexical document

### Configuration

- `datalayer.serverUrl` - Datalayer server URL (default: https://prod1.datalayer.run)
- `datalayer.runtime.environment` - Default runtime environment for notebooks (`python-cpu-env` or `ai-env`, default: `python-cpu-env`)
- `datalayer.runtime.creditsLimit` - Default credits limit for new runtimes (minimum: 1, default: 10)

## Runtime Management

The extension automatically manages Datalayer runtimes for notebook execution:

- **Automatic Creation**: Runtimes are created on-demand when opening notebooks
- **Runtime Reuse**: Existing active runtimes are reused to conserve credits
- **Environment Selection**: Choose between `python-cpu-env` (standard scientific libraries) or `ai-env` (ML frameworks)
- **Credits Management**: Configure default credits limit for new runtimes
- **Health Verification**: Automatic verification of runtime availability before reuse

## Installation

Install the extension from the [VS Code Marketplace](https://marketplace.visualstudio.com/items?itemName=datalayer.datalayer-vscode-datalayer) or:

1. Press `Ctrl+Shift+X` (or `Cmd+Shift+X` on Mac) to open Extensions
2. Search for "Datalayer Platform"
3. Click "Install"

Alternatively, install from a `.vsix` file:

1. Download the latest `.vsix` from our [releases](https://github.com/datalayer/vscode-datalayer/releases)
2. In VS Code: `Ctrl+Shift+P` → "Extensions: Install from VSIX..."
3. Select the downloaded file

## Known Limitations

- **WebSocket Protocol**: Uses older Jupyter protocol due to serialization constraints between webview and extension

## Developer Resources

- **🛠️ Development Guide**: [DEVELOPMENT.md](./DEVELOPMENT.md) - Setup, debugging, and architecture
- **🤝 Contributing**: [CONTRIBUTING.md](./CONTRIBUTING.md) - How to contribute and code standards
- **🚀 Release Process**: [RELEASE.md](./RELEASE.md) - Release workflow and roadmap
- **📚 API Documentation**: [https://vscode-datalayer.netlify.app](https://vscode-datalayer.netlify.app) - Complete TypeScript API docs

## License

MIT License - See [LICENSE](../../LICENSE) file for details.

## Support

For issues, feature requests, or questions, please visit our [GitHub repository](https://github.com/datalayer/jupyter-ui).
