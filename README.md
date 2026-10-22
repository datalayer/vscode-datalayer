<a href="https://datalayer.io"><img src="https://assets.datalayer.tech/datalayer-25.png" width="150"/></a>

[![Become a Sponsor](https://img.shields.io/static/v1?label=Become%20a%20Sponsor&message=%E2%9D%A4&logo=GitHub&style=flat&color=1ABC9C)](https://github.com/sponsors/datalayer)

[![Build Status](https://github.com/datalayer/vscode/actions/workflows/build-extension.yml/badge.svg)](https://github.com/datalayer/vscode/actions/workflows/build-extension.yml)
[![VS Code Marketplace](https://img.shields.io/visual-studio-marketplace/v/datalayer.datalayer-jupyter-vscode?label=VS%20Code%20Marketplace&logo=visual-studio-code)](https://marketplace.visualstudio.com/items?itemName=datalayer.datalayer-jupyter-vscode)
[![Installs](https://img.shields.io/visual-studio-marketplace/i/datalayer.datalayer-jupyter-vscode?label=Installs)](https://marketplace.visualstudio.com/items?itemName=datalayer.datalayer-jupyter-vscode)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Documentation](https://img.shields.io/badge/docs-TypeDoc-blue.svg)](https://vscode.netlify.app)

# Datalayer for Visual Studio Code

**🚀 Transform VS Code into a collaborative data science platform with seamless local-to-cloud scaling and rich document creation in just 2 clicks.**

💻 Execute notebooks on cloud compute, 📝 create beautiful reports with Notion-like collaborative documents, and 🔄 switch effortlessly between local and remote environments - all within your familiar VS Code interface.

**See it in action:**

<img src="https://assets.datalayer.tech/demo-vscode-lexical.gif" alt="Datalayer extension running Datalayer document in VS Code"/>

## 🚀 Key Benefits

### ⚡ **Instant Cloud Scaling**

- **Zero-setup cloud execution** - Run workloads on cloud CPUs or GPUs without any local Python installation
- **2-click scaling** - Switch from local development to cloud compute instantly via the kernel picker
- **Smart resource management** - Automatic runtime creation and reuse to optimize compute costs

### 📝 **Collaborative Rich Documents**

- **Notion-like documents** with rich formatting - Create beautiful reports with headings, lists, images, tables, executable code blocks, etc.
- **Real-time collaboration** - Multiple users can edit documents simultaneously with live updates
- **Mixed content support** - Seamlessly combine executable code, images, text, and more in a single document

### 🔀 **Ultimate Flexibility**

- **Seamless local ↔ cloud switching** - Start locally, scale to cloud, then return to local development
- **Multiple runtime support** - Connect to Datalayer cloud, local Python, or existing Jupyter servers
- **Code preservation** - Your code runs identically across local and cloud environments
- **Hybrid workflows** - Use the best of both worlds without vendor lock-in

## ⚡ Quick Start

1. **Create a free account** at [datalayer.app](https://datalayer.app).
2. **Install** from [VS Code Marketplace](https://marketplace.visualstudio.com/items?itemName=datalayer.datalayer-jupyter-vscode)
3. **Login**: `Ctrl+Shift+P` → "Datalayer: Login to Datalayer" → select your type of OAuth login (GitHub)
4. **Scale instantly**: Open any `.ipynb` file with the Datalayer Editor → click kernel picker → select cloud runtime
5. **Create rich docs**: Create `.dlex` files for Notion-like collaborative reports with code, images and rich formatting

## 🎯 Core Features

### 📊 **Advanced Document Editors**

#### Jupyter Notebooks

- Full-featured notebook editing with syntax highlighting and IntelliSense
- Execute on cloud GPUs/CPUs, local Python kernels, or remote Jupyter servers
- Seamless kernel switching between cloud, local, and remote runtimes
- Native ZMQ integration for local Python execution (no Jupyter server required)

#### Datalayer Documents

- Notion-like rich text editor with real-time collaborative editing
- Support for images, tables, code blocks, mathematical equations, and formatted text
- Perfect for creating data science reports, documentation, and presentations

### 🗂️ **Integrated Workspace Management**

**Document Outline** (Explorer Sidebar)

- View the structure of the currently open document
- Navigate headings and sections at a glance

**Datalayer Projects** (Explorer Sidebar)

- Browse and manage your Datalayer projects
- Create and rename projects
- Assign or unassign AI agents to projects
- View project details including associated notebooks and documents
- Open project files directly from the tree

**Datalayer Spaces** (Explorer Sidebar)

- Browse and manage your cloud documents and notebooks
- Create, rename, delete files directly in the cloud
- Virtual file paths: `datalayer://Space Name/document.ipynb`
- Access to shared workspaces

**Datalayer Runtimes** (Explorer Sidebar)

- Real-time monitoring of all active cloud environments
- One-click runtime creation and termination
- Environment type indicators (CPU/GPU, memory, duration)
- Health status monitoring

**Datalayer Settings** (Explorer Sidebar)

- **Datasources** - Manage connections to external data sources (Athena, BigQuery, MS Sentinel, Splunk)
  - Create and configure datasources with database and output bucket settings
  - Click to edit datasource properties
  - Quick access via right-click context menu
  - Type indicator shows datasource variant (athena, bigquery, mssentinel, splunk)
- **Secrets** - Secure credential management for datasource authentication

### ⚙️ **Smart Runtime Management**

- **Auto-connect** - Documents automatically connect to available runtimes (configurable)
- **On-demand creation** - Create runtimes through the kernel picker when needed
- **Intelligent reuse** - Existing healthy runtimes are reused to conserve credits
- **Health verification** - Automatic checks ensure runtime reliability
- **Flexible duration** - Configure runtime lifetime (1-1440 minutes)

### 🎨 **Native VS Code Integration**

- **Theme synchronization** - Documents automatically match your VS Code theme
- **Unified kernel picker** - Access Datalayer cloud runtimes, local Python environments (via Python extension), and existing Jupyter servers
- **Native local execution** - Direct ZMQ kernel communication without Jupyter server
- **Rich status indicators** - Connection status and runtime info in status bar
- **Command palette integration** - All features accessible via `Ctrl+Shift+P`
- **GitHub Copilot integration** - Use natural language to create notebooks and insert cells (e.g., "Create a local notebook and add a plot")

### Talk to your agent

An application you built and deployed in the Datalayer Agent Studio answers in VS Code, in the **Agent Chat** sidebar. This is a preview, off by default: turn on the **Datalayer › Agent Chat: Enabled** setting (`datalayer.agentChat.enabled`) to use it. Off, the sidebar lists no application and asks Datalayer nothing about them; your runtimes' chat is the same either way.

1. Sign in to Datalayer (`Datalayer: Login`) and turn on `datalayer.agentChat.enabled`.
2. In the Studio, open the application's **Ship** tab and turn on **Always on**: VS Code talks to the runtime the deployment is kept on.
3. Open the **Agent Chat** sidebar and pick the application under **Your applications**. A deployment that cannot be talked to is listed as closed under **Not available here**, saying why: paused, not live, not kept always on, or its runtime not running.
4. Talk to it. The conversation is a session of the deployment, through the same session API its hosted page uses, in your name.

- **Approvals** - when one of its rules says _ask me first_, the request appears in the chat: approve or decline it there. The editor also shows a notification naming the application, the action and its class (_execute_, _write_, _delete_…) — never what it would run — with **Approve**, **Decline** and **Show**; a decision from the notification is taken only after the chat has shown the request and the approval was read again, and one answered elsewhere is said so.
- **Diffs** - what a coding agent changed in a file is drawn in the chat as a diff; **Open in the editor** on the row opens it in the editor's diff view, _before_ and _after_, the _after_ side the file on disk when it holds what the agent wrote. The editor reviews a diff; it never applies one.
- **Terminals** - what the agent ran is written, as it runs, to a read-only terminal named after the session in the Terminal panel: the command, its output, its exit. Its commands are decided in the chat, not typed there.
- **The status bar** - _Datalayer: 2 waiting for you_ while sessions wait on you (click to open the first), _Datalayer: working…_ while a turn runs; a session the chat does not show says when its turn finishes, in a notification.
- **What it did** - under the chat, each tool it called as a line, e.g. `Support Desk → odoo-accounting: odoo_accounting_aged_balance`.
- **Your open file** - only when the application lets its host pass the page (`deployment.embedded.host.context: [page]` in its Appspec) and a rule lets `host_context` run: when its agent asks, it gets the file open in your editor (its path, language, text up to 20,000 characters, and the selection). Nothing is read before it asks, and nothing when the application says otherwise.
- **Signed users** - an application that takes only a signed user (`deployment.embedded.host.user: signed`) is opened in VS Code with a short user token Datalayer signs for you (fifteen minutes; the extension host asks ai-agents for it with your token and puts it in the runs; the sidebar never holds it), sent with each run as `forwardedProps.loop.user_token`. Only the version deployed decides: when the application was saved since, it is not opened until that version is deployed.

### Sessions

The **Sessions** view in the Datalayer sidebar lists the conversations you opened with your applications' agents — **on Datalayer** (the sessions Datalayer keeps for you, grouped by application) and **on this machine** (the sessions of a local runtime running in one of your workspace folders) — each with its state (open, paused, ended, and whether it is answering or waiting for you), its agent and the coding agent it runs on, its turns and where it comes from (cloned from another session at a turn, imported from a file). A **Teams** group lists your team runs with their seats; a seat's session opens by its uid. Filter by application, state and title from the title bar; archived sessions are hidden. The view refreshes when you sign in, when a local runtime starts or stops, and with the title's button — it never polls.

Right-click a session for its verbs, the same `loop sessions` and the web chat offer: **Resume**, **Switch Agent…** (another agent of the runtime goes on with the conversation; it is told so in a sentence, shown to you), **Clone from Here…** (a new session, paused, cut at the turn you name), **Export…** (a `<uid>.session.jsonl` file), **Rename…**, **Archive**, **End**; **Import a Session…** in the title bar imports such a file on a runtime of your choice, and asks you for an agent when the runtime says the file's is not there. Every refusal is the runtime's own sentence. A local session's folder opens with **Reveal in Explorer**; a Datalayer session's application opens with **Open in the Studio**.

### A coding agent in your folder

A coding agent — Claude Code, Codex, any coding agent of the catalogue — runs in a workspace folder **on your own machine**, behind the Shield, through a **local runtime** the extension starts for that folder (`loop serve`, one per folder, never at startup). `loop` is a prerequisite, not bundled: install it once with

```bash
uv tool install 'agent-runtimes[shield]'
```

and the extension finds it on your PATH (or under uv tool's and pipx's bins, or where `datalayer.local.loopPath` says). When it is missing or too old, the extension says so in a sentence with the install line to copy. **Datalayer: Start the Local Runtime** and **Stop the Local Runtime** are in the command palette and the Sessions view's menu; the runtime's output is in the _Datalayer: Local runtime_ channel. Its sessions live in `~/.datalayer/sessions`, where `loop sessions list` lists them too.

Before a coding agent starts, **Datalayer: Check a Coding Agent on This Machine** checks what it needs — `node` and `git` and their versions, its adapter, its credential (`ANTHROPIC_API_KEY` for Claude Code, `OPENAI_API_KEY` for Codex) — and says each missing part; it offers to open a terminal with `agent-shield setup --harness <id>` typed for you to run, and to take the credential with **Datalayer: Set a Harness Credential**, which keeps it in VS Code's secret storage, never in settings and never shown. The credential is taken from your environment first, the secret storage second; the extension says which it used. A coding agent whose terms serve third parties with an API key only is not started on a subscription login. When you are signed in, the local runtime is given your Datalayer token and reads your organization's Shield policies; signed out, the local policy file alone.

**Datalayer: Start a coding agent here** starts one in the open folder (the harness picked from the catalogue, the application the blank one or one of the folder's own Appspecs) and opens its session in the Datalayer Chat. Your folder's own `CLAUDE.md`, `AGENTS.md`, `GEMINI.md` or `.goosehints` is kept as it is: the coding agent reads it as its own, and the application's instructions are written beside it, under `.datalayer/` (read-only to the agent), and handed to it ahead of the session's first prompt — the session's first line says so. An _ask me first_ request is an editor notification and the chat's banner; what the agent ran is in a read-only terminal of the Terminal panel as it streams; a file it changed opens in the diff view.

## 💡 Common Questions

**Do I need Python locally?** No! Cloud runtimes handle all execution with zero local setup. You can still connect to local Python/Jupyter environments if preferred for hybrid workflows.

**Can I edit cloud documents?** Yes! Cloud documents are fully editable. Create, modify, and collaborate on notebooks and Datalayer documents directly in your cloud spaces.

**How do credits work?** Runtimes consume credits while active. The extension intelligently reuses existing healthy runtimes to minimize costs and maximize your credit efficiency.

**Can I use without a Datalayer account?** Absolutely! Use it for local `.ipynb` files and connecting to your existing Python/Jupyter environments. Cloud features require an account.

**How do I get an access token?** Visit [datalayer.app](https://datalayer.app), navigate to account settings, and generate a token for VS Code integration.

**How fast is the local ↔ cloud switching?** Switching between local and cloud execution takes just 2 clicks via the kernel picker - no configuration or setup required.

**What makes Datalayer Documents special?** Think Notion meets Jupyter! Unlike traditional notebooks, Datalayer Documents provide a Notion-like editing experience with rich formatting, real-time collaboration, and support for images, tables, and formatted text alongside executable code - perfect for creating professional reports and documentation.

## Installation

**From Marketplace:**

1. Open Extensions view (`Ctrl+Shift+X` / `Cmd+Shift+X`)
2. Search "Datalayer Platform"
3. Click Install

**From `.vsix` file:**

1. Download from [releases](https://github.com/datalayer/vscode/releases)
2. Open Command Palette (`Ctrl+Shift+P` / `Cmd+Shift+P`) → "Extensions: Install from VSIX..."

## Key Commands

**Home:**

- Home (_Datalayer: Home_, or _Open Datalayer_ at the top of the Datalayer sidebar): the sidebar's Sessions, Agents, Spaces, Outline and Settings as one page

**Authentication:**

- Login/Logout
- Show Authentication Status

**Projects:**

- Create/Rename Projects
- Assign/Unassign AI Agents
- View Project Details
- Refresh Projects

**Documents:**

- Create New Jupyter Notebook (local or cloud)
- Create New Datalayer Document (local or cloud)
- Context menu in Spaces tree: New Notebook/Datalayer Document in cloud workspace
- Context menu: Open, Rename, Delete

**Sessions:**

- Refresh/Filter Sessions, Import a Session…
- Context menu: Resume, Switch Agent…, Clone from Here…, Export…, Rename…, Archive, End, Reveal in Explorer, Open in the Studio
- Check a Coding Agent on This Machine, Set a Harness Credential
- Start/Stop the Local Runtime
- Start a Coding Agent Here

**Applications:**

- Try This Application (hot reload, the page beside the editor)
- Open This Application's Validate Tab / Ship Tab (in the browser)

**Runtimes:**

- Select/Switch Runtime (local ↔ cloud switching)
- Terminate Runtime(s)
- View Runtime Controllers Status
- Monitor resource usage and costs

## Configuration

Open settings (`Ctrl+,` / `Cmd+,`) and search "Datalayer":

**Service URLs** - Defaults:

- `datalayer.services.iamUrl`
- `datalayer.services.runtimesUrl`
- `datalayer.services.spacerUrl`
- `datalayer.services.spacerWsUrl` (WebSocket: `wss://prod1.datalayer.run`)

**Runtime:**

- `datalayer.runtime.defaultMinutes` - Duration (default: 10, max: 1440)
- `datalayer.autoConnect.strategies` - Auto-connect strategies when opening documents (default: `["Active Runtime", "Ask"]`)
  - `["Active Runtime"]` - Automatically connect to runtime with most time remaining
  - `["Active Runtime", "Ask"]` - Try active runtime, then ask user if none available
  - `["Ask"]` - Always show runtime selection dialog
  - `[]` - No auto-connect, manual selection required

**Local runtime:**

- `datalayer.local.enabled` - Start a local runtime (`loop serve`) in a workspace folder when a session asks for it (default: true)
- `datalayer.local.loopPath` - Where `loop` is; empty looks on PATH, then under uv tool's and pipx's bins

**Logging:**

- `datalayer.logging.level` - trace/debug/info/warn/error (default: info)
- `datalayer.logging.includeTimestamps` - Add timestamps (default: true)
- `datalayer.logging.enableDatalayerLogging` - Log API calls (default: true)
- `datalayer.logging.enablePerformanceMonitoring` - Track performance (default: false)

## Recent Updates

### Runtime Controller Improvements

- **Smart Runtime Switching**: Kernel picker now shows individual runtime controllers for seamless switching between cloud environments
- **Automatic Kernel Selection**: Selecting a runtime automatically activates it as the notebook kernel
- **Proper Cleanup**: Switching between runtimes properly disposes old WebSocket connections
- **Tree View Sync**: Runtime tree automatically refreshes when runtimes are created or selected

## Developer Resources

- [DEVELOPMENT.md](./dev/docs/DEVELOPMENT.md) - Setup, debugging, architecture, jupyter package workflow
- [CONTRIBUTING.md](./dev/docs/CONTRIBUTING.md) - Contribution guidelines
- [TESTING.md](./dev/docs/TESTING.md) - Test infrastructure and coverage
- [CHANGELOG.md](./CHANGELOG.md) - Version history
- [API Documentation](https://vscode.netlify.app) - Complete TypeScript API reference

## Support & Community

- [GitHub Issues](https://github.com/datalayer/vscode/issues) - Bug reports and features
- [Datalayer Docs](https://docs.datalayer.ai) - Platform documentation
- [Website](https://datalayer.ai) - Learn more

## License

MIT License - See [LICENSE](./LICENSE.txt)
