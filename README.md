<a href="https://datalayer.io"><img src="https://assets.datalayer.tech/datalayer-25.png" width="150"/></a>

[![Become a Sponsor](https://img.shields.io/static/v1?label=Become%20a%20Sponsor&message=%E2%9D%A4&logo=GitHub&style=flat&color=1ABC9C)](https://github.com/sponsors/datalayer)

## Project Status

[![Build Status](https://github.com/datalayer/vscode-datalayer/actions/workflows/build-extension.yml/badge.svg)](https://github.com/datalayer/vscode-datalayer/actions/workflows/build-extension.yml)
[![VS Code Marketplace](https://img.shields.io/visual-studio-marketplace/v/Datalayer.datalayer-jupyter-vscode?label=VS%20Code%20Marketplace&logo=visual-studio-code)](https://marketplace.visualstudio.com/items?itemName=Datalayer.datalayer-jupyter-vscode)
[![Installs](https://img.shields.io/visual-studio-marketplace/i/Datalayer.datalayer-jupyter-vscode?label=Installs)](https://marketplace.visualstudio.com/items?itemName=Datalayer.datalayer-jupyter-vscode)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Documentation](https://img.shields.io/badge/docs-TypeDoc-blue.svg)](https://datalayer-desktop.netlify.app)

# Datalayer for Visual Studio Code

Edit Jupyter Notebooks (`.ipynb`) and Lexical documents (`.lexical`) with seamless integration to the Datalayer platform. Run notebooks in the cloud with zero local Python setup, or connect to your own Jupyter servers.

**See it in action:**

<img src="https://jupyter-examples.datalayer.tech/jupyter-react-vscode.gif" alt="Datalayer extension running Jupyter notebook in VS Code"/>

## Quick Start

1. Install from [VS Code Marketplace](https://marketplace.visualstudio.com/items?itemName=Datalayer.datalayer-jupyter-vscode)
2. Login: Open Command Palette (`Ctrl+Shift+P` / `Cmd+Shift+P`) → "Datalayer: Login to Datalayer"
3. Open any `.ipynb` file or browse your spaces in the sidebar
4. Run cells with cloud runtimes

## Features

### Two Document Editors

**Jupyter Notebooks** - Full notebook editing with cloud or local execution
**Lexical Documents** - Rich text editing with formatting (headings, lists, bold, italic, etc.)

### Two Tree Views (Explorer Sidebar)

**Datalayer Spaces** - Browse and manage your cloud documents

- Create, rename, delete notebooks and lexical documents
- Virtual file paths: `datalayer://Space Name/document.ipynb`

**Datalayer Runtimes** - Monitor and control cloud environments

- View all active runtimes with status indicators
- Create, terminate, and manage computational environments
- Monitor environment type and resource usage

### Runtime Management

- Automatic runtime creation when you run cells
- Smart reuse of existing runtimes to conserve credits
- Health verification before reuse
- Configurable runtime duration (1-1440 minutes)

### VS Code Integration

- Documents match your VS Code theme automatically
- Kernel picker supports Datalayer, local Python, Jupyter servers, and Pyodide (offline)
- Status bar shows connection and runtime info

### Offline Execution with Pyodide

- **Pyodide Kernel**: Run Python code entirely in-browser (no server needed)
- **Zero Setup**: No local Python installation required
- **Works Offline**: Execute notebooks without internet connection
- **Package Preloading**: Automatically download common packages (numpy, pandas, matplotlib, etc.)
- **Configurable Behavior**: Control when packages are downloaded (ask-once, ask-always, auto, disabled)
- **Cache Management**: Clear package cache with `datalayer.pyodide.clearCache` command

## Installation

**From Marketplace:**

1. Open Extensions view (`Ctrl+Shift+X` / `Cmd+Shift+X`)
2. Search "Datalayer Platform"
3. Click Install

**From `.vsix` file:**

1. Download from [releases](https://github.com/datalayer/vscode-datalayer/releases)
2. Open Command Palette (`Ctrl+Shift+P` / `Cmd+Shift+P`) → "Extensions: Install from VSIX..."

## Getting Started

### Opening Documents

**Notebooks**: Right-click `.ipynb` → "Open With..." → "Datalayer Notebook"
**Lexical**: Click any `.lexical` file (opens automatically)
**Cloud Documents**: Click files in the Datalayer Spaces tree view

### Authentication

1. Open Command Palette (`Ctrl+Shift+P` / `Cmd+Shift+P`) → "Datalayer: Login to Datalayer"
2. Paste your access token
3. Check status bar for connection status

### Key Commands

**Authentication:**

- Login/Logout
- Show Authentication Status

**Documents:**

- Create New Jupyter Notebook (local)
- Create New Lexical Document (local)
- Context menu in Spaces tree: New Notebook/Lexical in cloud space
- Context menu: Open, Rename, Delete

**Runtimes:**

- Select/Switch Runtime
- Terminate Runtime(s)
- View Runtime Controllers Status

## Configuration

Open settings (`Ctrl+,` / `Cmd+,`) and search "Datalayer":

**Service URLs** - Default to `https://prod1.datalayer.run`:

- `datalayer.services.iamUrl`
- `datalayer.services.runtimesUrl`
- `datalayer.services.spacerUrl`
- `datalayer.services.spacerWsUrl` (WebSocket: `wss://prod1.datalayer.run`)

**Runtime:**

- `datalayer.runtime.defaultMinutes` - Duration (default: 10, max: 1440)

**Logging:**

- `datalayer.logging.level` - trace/debug/info/warn/error (default: info)
- `datalayer.logging.includeTimestamps` - Add timestamps (default: true)
- `datalayer.logging.enableSDKLogging` - Log API calls (default: true)
- `datalayer.logging.enablePerformanceMonitoring` - Track performance (default: false)

**Pyodide:**

- `datalayer.pyodide.preloadBehavior` - When to download packages (ask-once/ask-always/auto/disabled, default: ask-once)
- `datalayer.pyodide.preloadPackages` - List of packages to preload (24 packages by default)

## Common Questions

**Do I need Python locally?** No, cloud runtimes handle execution. You can connect to local Python/Jupyter if preferred.

**Why are cloud documents read-only?** To prevent accidental changes. Copy to local workspace to edit.

**How do credits work?** Runtimes consume credits while active. Extension reuses existing runtimes to conserve credits.

**Can I use without Datalayer account?** Yes, for local `.ipynb` files and connecting to local Python/Jupyter.

**How do I get an access token?** Visit datalayer.io, navigate to account settings, and generate a token.

**What's Pyodide?** Python compiled to WebAssembly for browser-based execution. No server or local Python needed.

## Recent Updates (October 2025)

### Pyodide Integration (Production Ready)

- **✅ Complete**: Full Pyodide kernel support with TypeScript strict mode compliance
- **Browser-Based Execution**: Run Python code entirely in-browser with zero server dependencies
- **Offline Capability**: Execute notebooks without internet connection after initial package download
- **Package Preloading**: Configurable behavior for downloading common Python packages
- **Cache Management**: Clear package cache with dedicated command
- **Streaming Output**: Real-time output display with preserved line breaks
- **Message Protocol**: Complete Jupyter message protocol compliance with IAnyMessageArgs interface

### Runtime Controller Improvements

- **Smart Runtime Switching**: Kernel picker now shows individual runtime controllers for seamless switching between cloud environments
- **Automatic Kernel Selection**: Selecting a runtime automatically activates it as the notebook kernel
- **Proper Cleanup**: Switching between runtimes properly disposes old WebSocket connections
- **Tree View Sync**: Runtime tree automatically refreshes when runtimes are created or selected

### Documentation & Quality

- **TypeDoc API Documentation**: Complete API documentation now available at [datalayer-desktop.netlify.app](https://datalayer-desktop.netlify.app)
- **Zero TypeDoc Warnings**: All exported types properly documented
- **Node.js 20 Compatibility**: Fully updated to match VS Code 1.98.0 runtime requirements

## Known Limitations

- Cloud documents open read-only (copy to local workspace to edit)
- Uses older Jupyter WebSocket protocol (technical constraint)

## Developer Resources

- [DEVELOPMENT.md](./dev/docs/DEVELOPMENT.md) - Setup, debugging, architecture
- [CONTRIBUTING.md](./dev/docs/CONTRIBUTING.md) - Contribution guidelines
- [TESTING.md](./dev/docs/TESTING.md) - Test infrastructure (41 tests, 100% pass)
- [CHANGELOG.md](./CHANGELOG.md) - Version history
- [Pyodide Integration](./dev/docs/PYODIDE.md) - Offline Python execution details

## Support & Community

- [GitHub Issues](https://github.com/datalayer/vscode-datalayer/issues) - Bug reports and features
- [Datalayer Docs](https://docs.datalayer.io) - Platform documentation
- [Website](https://datalayer.io) - Learn more

## License

MIT License - See [LICENSE](./LICENSE.txt)
