<a href="https://datalayer.io"><img src="https://assets.datalayer.tech/datalayer-25.png" width="150"/></a>

[![Become a Sponsor](https://img.shields.io/static/v1?label=Become%20a%20Sponsor&message=%E2%9D%A4&logo=GitHub&style=flat&color=1ABC9C)](https://github.com/sponsors/datalayer)

## Project Status

[![Build Status](https://github.com/datalayer/vscode-datalayer/actions/workflows/build-extension.yml/badge.svg)](https://github.com/datalayer/vscode-datalayer/actions/workflows/build-extension.yml)
[![VS Code Marketplace](https://img.shields.io/visual-studio-marketplace/v/Datalayer.datalayer-jupyter-vscode?label=VS%20Code%20Marketplace&logo=visual-studio-code)](https://marketplace.visualstudio.com/items?itemName=Datalayer.datalayer-jupyter-vscode)
[![Installs](https://img.shields.io/visual-studio-marketplace/i/Datalayer.datalayer-jupyter-vscode?label=Installs)](https://marketplace.visualstudio.com/items?itemName=Datalayer.datalayer-jupyter-vscode)
[![Rating](https://img.shields.io/visual-studio-marketplace/r/Datalayer.datalayer-jupyter-vscode?label=Rating)](https://marketplace.visualstudio.com/items?itemName=Datalayer.datalayer-jupyter-vscode)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Documentation](https://img.shields.io/badge/docs-TypeDoc-blue.svg)](https://vscode-datalayer.netlify.app)
[![Netlify Status](https://api.netlify.com/api/v1/badges/d73cd7a0-952b-405e-9e94-63d00ce01320/deploy-status)](https://app.netlify.com/sites/datalayer-desktop/deploys)

## Built With

[![TypeScript](https://img.shields.io/badge/TypeScript-007ACC?style=flat&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![React](https://img.shields.io/badge/React-61DAFB?style=flat&logo=react&logoColor=black)](https://reactjs.org/)
[![Jupyter](https://img.shields.io/badge/Jupyter-F37626?style=flat&logo=jupyter&logoColor=white)](https://jupyter.org/)

# Datalayer for Visual Studio Code

This [Visual Studio Code](https://code.visualstudio.com) extension enables you to edit and collaborate on [Jupyter](https://jupyter.org) Notebooks (`.ipynb` files) and Lexical documents (`.lexical` files) with seamless integration to the [Datalayer](https://datalayer.io) platform. The extension supports real-time collaborative editing for both document types, allowing multiple users to work together simultaneously.

**See it in action:**

<img src="https://jupyter-examples.datalayer.tech/jupyter-react-vscode.gif" alt="Datalayer extension running Jupyter notebook in VS Code with live code execution and output"/>

## 🚀 Quick Start

1. **Install** from [VS Code Marketplace](https://marketplace.visualstudio.com/items?itemName=Datalayer.datalayer-jupyter-vscode)
2. **Login** via Command Palette (`Cmd+Shift+P`) → "Datalayer: Login to Datalayer"
3. **Open** any `.ipynb` file or browse your spaces in the sidebar
4. **Run** notebook cells with the Datalayer runtime

That's it! Your notebooks run in the cloud with zero local Python setup.

## Installation

Install the extension from the [VS Code Marketplace](https://marketplace.visualstudio.com/items?itemName=Datalayer.datalayer-jupyter-vscode) or:

1. Press `Ctrl+Shift+X` (or `Cmd+Shift+X` on Mac) to open Extensions
2. Search for "Datalayer Platform"
3. Click "Install"

Alternatively, install from a `.vsix` file:

1. Download the latest `.vsix` from our [releases](https://github.com/datalayer/vscode-datalayer/releases)
2. In VS Code: `Ctrl+Shift+P` → "Extensions: Install from VSIX..."
3. Select the downloaded file

## ✨ What You Get

**Edit Notebooks Anywhere**

- Open `.ipynb` files with full Jupyter support
- Cloud-powered execution (no local Python needed)
- Real-time collaboration with your team
- IPyWidgets support for interactive visualizations

**Seamless VS Code Integration**

- Notebooks and documents automatically match your VS Code theme
- Unified kernel picker (Datalayer, local Python, Jupyter servers)
- Status bar shows connection and runtime info
- Native toolbar for notebook operations

**Smart Runtime Management**

- Automatic runtime creation and reuse
- Choose Python CPU or AI/ML environments
- Credit-based usage (configure limits in settings)
- Health verification before reuse

**Datalayer Spaces**

- Browse and manage documents across all your spaces
- Create notebooks and lexical documents within any space
- Virtual file system with clean paths (`datalayer:/Space Name/document.ipynb`)
- Context menu actions for document management

## Getting Started

### Using Notebooks

1. **Open a notebook**: Click any `.ipynb` file in your workspace or Datalayer spaces
2. **Select a kernel**: Click the kernel picker in the toolbar
3. **Run cells**: Use the toolbar or keyboard shortcuts (`Shift+Enter`)
4. **Monitor status**: Watch the kernel indicator (🟢 idle, 🟡 busy, 🔴 error)

The toolbar displays "Datalayer: {Runtime name}" when connected to a cloud runtime.

### Authentication

Connect to your Datalayer account:

1. **Login**: Command Palette (`Cmd+Shift+P`) → "Datalayer: Login to Datalayer"
2. **Enter token**: Paste your Datalayer access token when prompted
3. **Verify**: Check the status bar for the Datalayer icon

Your profile information is automatically fetched if you authenticated via GitHub.

### Configuration

Customize the extension in VS Code settings:

- `datalayer.serverUrl` - Datalayer server URL (default: https://prod1.datalayer.run)
- `datalayer.runtime.environment` - Default runtime environment: `python-cpu-env` (standard scientific libraries) or `ai-env` (ML frameworks)
- `datalayer.runtime.creditsLimit` - Default credits limit for new runtimes (minimum: 1, default: 10)

## 💡 Common Questions

**Q: Do I need Python installed locally?**
A: No! Datalayer runtimes run in the cloud. You can also connect to local Python environments or Jupyter servers if you prefer.

**Q: How do I connect to my own Jupyter server?**
A: Use the kernel picker in the notebook toolbar → select your Jupyter server URL from the unified picker.

**Q: Why is my Datalayer document read-only?**
A: Documents from Datalayer spaces open in read-only mode for safe viewing. To edit, copy the file to your local workspace.

**Q: How are credits used?**
A: Runtimes consume credits while active. The extension automatically reuses existing runtimes to conserve credits. Configure the default limit in settings.

**Q: Can I use this without a Datalayer account?**
A: Yes! You can use the extension with local `.ipynb` files and connect to local Python environments or Jupyter servers without authentication.

## Advanced Features

### Datalayer Spaces Tree View

Browse and manage your cloud documents in the Explorer sidebar:

- **Hierarchical Display**: Shows "Datalayer (@username)" with spaces as folders
- **Document Management**: Create, rename, and delete notebooks and lexical documents
- **Context Menu**: Right-click for quick actions (Open, Rename, Delete)
- **Visual Indicators**: Default space marked with "(Default)" label

Tree structure example:

```
Datalayer (@username)
├── My Library (Default) [📓] [📄]
│   ├── notebook1.ipynb
│   └── document1.lexical
```

### Lexical Rich Text Editor

Edit `.lexical` documents with full formatting:

- **Rich Text**: Bold, italic, underline, strikethrough, inline code
- **Structure**: Headings (H1-H3), bullet lists, numbered lists
- **Formatting**: Text alignment (left, center, right)
- **Shortcuts**: Type markdown syntax for quick formatting
- **Theme Integration**: Automatically matches your VS Code theme

Create new lexical documents via Command Palette → "Datalayer: Create new Datalayer Lexical Document"

### Available Commands

Access via Command Palette (`Cmd+Shift+P`):

- `Datalayer: Login to Datalayer` - Authenticate with your account
- `Datalayer: Logout from Datalayer` - Sign out
- `Datalayer: Show Authentication Status` - View current status
- `Datalayer: Create new Datalayer Notebook` - Create notebook file
- `Datalayer: Create new Datalayer Lexical Document` - Create lexical document
- `Datalayer: Refresh Spaces` - Refresh the spaces tree view
- `Datalayer: Select/Switch Runtime` - Change runtime environment
- `Datalayer: Terminate Runtime` - Stop current runtime

## Known Limitations

- **WebSocket Protocol**: Uses older Jupyter protocol due to serialization constraints between webview and extension

## Developer Resources

- **🛠️ Development Guide**: [DEVELOPMENT.md](./DEVELOPMENT.md) - Setup, debugging, and architecture
- **🤝 Contributing**: [CONTRIBUTING.md](./CONTRIBUTING.md) - How to contribute and code standards
- **🚀 Release Process**: [RELEASE.md](./RELEASE.md) - Release workflow and roadmap
- **📚 API Documentation**: [https://vscode-datalayer.netlify.app](https://vscode-datalayer.netlify.app) - Complete TypeScript API docs

## License

MIT License - See [LICENSE](./LICENSE.txt) file for details.

## 📞 Support & Community

- **Issues**: [GitHub Issues](https://github.com/datalayer/vscode-datalayer/issues) - Report bugs or request features
- **Discussions**: [GitHub Discussions](https://github.com/datalayer/vscode-datalayer/discussions) - Ask questions and share ideas
- **Documentation**: [Datalayer Docs](https://docs.datalayer.io) - Complete platform documentation
- **Website**: [datalayer.io](https://datalayer.io) - Learn more about Datalayer
