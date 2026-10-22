<a href="https://datalayer.ai"><img src="https://images.datalayer.io/legacy/datalayer-25.png" width="150"/></a>

[![Become a Sponsor](https://img.shields.io/static/v1?label=Become%20a%20Sponsor&message=%E2%9D%A4&logo=GitHub&style=flat&color=1ABC9C)](https://github.com/sponsors/datalayer)

[![Build Status](https://github.com/datalayer/vscode/actions/workflows/build-extension.yml/badge.svg)](https://github.com/datalayer/vscode/actions/workflows/build-extension.yml)
[![VS Code Marketplace](https://img.shields.io/visual-studio-marketplace/v/datalayer.datalayer-jupyter-vscode?label=VS%20Code%20Marketplace&logo=visual-studio-code)](https://marketplace.visualstudio.com/items?itemName=datalayer.datalayer-jupyter-vscode)
[![Installs](https://img.shields.io/visual-studio-marketplace/i/datalayer.datalayer-jupyter-vscode?label=Installs)](https://marketplace.visualstudio.com/items?itemName=datalayer.datalayer-jupyter-vscode)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

# Datalayer for Visual Studio Code

**Your Datalayer agents and their sessions, in VS Code.** Talk to the applications you deployed, decide their approvals from the editor, pick any conversation back up, and run a coding agent in your own folder behind the Shield. Notebooks and documents run on cloud runtimes when you need the compute.

<img src="https://images.datalayer.io/products/vscode/home.png" alt="The Datalayer page in VS Code: your sessions, agents, spaces, outline and settings under tabs, beside the Datalayer sidebar and the Datalayer Chat"/>

## Talk to your agents

Pick an application you deployed in the Datalayer Agent Studio in the **Datalayer Chat** sidebar and talk to it. The conversation is a session of the deployment, in your name.

- **Approvals** when a rule says _ask me first_: in the chat, or from the editor's notification.
- **Diffs** of what a coding agent changed, opened in the editor's diff view.
- **Terminals** showing what the agent ran, as it runs.
- **The status bar** says when sessions are waiting for you.

[More about the chat →](docs/agents.md)

## Pick up any session

The **Sessions** view lists your conversations, on Datalayer and on this machine, with their state, agent and turns. Right-click one to **Resume**, **Switch Agent…**, **Clone from Here…**, **Export…**, **Rename…**, **Archive** or **End**; import a session from a file.

[More about sessions →](docs/sessions.md)

## A coding agent in your folder

Run Claude Code, Codex or another coding agent of the catalogue in a workspace folder, behind the Shield, through a local runtime. Install `loop` once:

```bash
uv tool install 'agent-runtimes[shield]'
```

Then **Datalayer: Check a Coding Agent on This Machine**, and **Datalayer: Start a coding agent here**.

[More about local coding agents →](docs/sessions.md#a-coding-agent-in-your-folder)

## Notebooks and documents

Jupyter notebooks and Datalayer documents, run on cloud CPUs or GPUs, local Python or your Jupyter servers, switched from the kernel picker. Your cloud spaces are in the sidebar.

[More about notebooks, documents and runtimes →](docs/notebooks-and-documents.md)

## Get started

1. Install from the [VS Code Marketplace](https://marketplace.visualstudio.com/items?itemName=datalayer.datalayer-jupyter-vscode), or a `.vsix` from the [releases](https://github.com/datalayer/vscode/releases) (**Extensions: Install from VSIX…**).
2. Create a free account at [datalayer.app](https://datalayer.app).
3. Sign in: **Datalayer: Login to Datalayer**.
4. Open **Datalayer: Home**, or the **Datalayer Chat** sidebar.

All commands and settings: [docs/commands-and-settings.md](docs/commands-and-settings.md).

## Developers

- [DEVELOPMENT.md](./dev/docs/DEVELOPMENT.md): setup, debugging, architecture
- [CONTRIBUTING.md](./dev/docs/CONTRIBUTING.md) and [TESTING.md](./dev/docs/TESTING.md)
- [CHANGELOG.md](./CHANGELOG.md)
- [API reference](https://vscode.netlify.app)

## Support

[GitHub issues](https://github.com/datalayer/vscode/issues) · [Datalayer docs](https://docs.datalayer.ai) · [datalayer.ai](https://datalayer.ai)

## License

MIT, see [LICENSE](./LICENSE.txt).
