# Sessions

The **Sessions** view in the Datalayer sidebar lists the conversations you opened with your applications' agents:

- **On Datalayer**: the sessions Datalayer keeps for you, grouped by application.
- **On this machine**: the sessions of a local runtime running in one of your workspace folders.
- **Teams**: your team runs with their seats. A seat's session opens by its uid.

Each session shows its state (open, paused, ended, answering or waiting for you), its agent and the coding agent it runs on, its turns, and where it comes from (cloned from another session at a turn, or imported from a file). Filter by application, state and title from the title bar; archived sessions are hidden. The view refreshes when you sign in, when a local runtime starts or stops, and with the title's refresh button. It never polls.

## What you can do with a session

Right-click a session. These are the same verbs `loop sessions` and the web chat offer:

| Verb                   | What it does                                                                                     |
| ---------------------- | ------------------------------------------------------------------------------------------------ |
| **Resume**             | Opens the session in the Datalayer Chat and continues it.                                        |
| **Switch Agent…**      | Another agent of the runtime goes on with the conversation; it is told so in a sentence you see. |
| **Clone from Here…**   | A new session, paused, cut at the turn you name.                                                 |
| **Export…**            | Saves a `<uid>.session.jsonl` file.                                                              |
| **Rename…**            | Gives the session a title.                                                                       |
| **Archive**            | Hides it from the list.                                                                          |
| **End**                | Ends it.                                                                                         |
| **Reveal in Explorer** | A local session: opens its folder.                                                               |
| **Open in the Studio** | A Datalayer session: opens its application.                                                      |

**Import a Session…** in the title bar imports a `.session.jsonl` file on a runtime of your choice, and asks you for an agent when the runtime does not have the file's. Every refusal is the runtime's own sentence.

## A coding agent in your folder

A coding agent (Claude Code, Codex, or any coding agent of the catalogue) runs in a workspace folder **on your own machine**, behind the Shield, through a **local runtime** the extension starts for that folder (`loop serve`, one per folder, never at startup).

`loop` is a prerequisite, not bundled. Install it once:

```bash
uv tool install 'agent-runtimes[shield]'
```

The extension finds it on your PATH, under uv tool's and pipx's bins, or where `datalayer.local.loopPath` says. When it is missing or too old, the extension says so, with the install line to copy.

- **Datalayer: Start the Local Runtime** and **Stop the Local Runtime** are in the command palette and the Sessions view's menu. The runtime's output is in the _Datalayer: Local runtime_ channel. Its sessions live in `~/.datalayer/sessions`, where `loop sessions list` lists them too.
- **Datalayer: Check a Coding Agent on This Machine** checks what a coding agent needs: `node` and `git` and their versions, its adapter, its credential (`ANTHROPIC_API_KEY` for Claude Code, `OPENAI_API_KEY` for Codex). It says each missing part, offers a terminal with `agent-shield setup --harness <id>` typed for you, and takes the credential with **Datalayer: Set a Harness Credential**, which keeps it in VS Code's secret storage, never in settings. The credential is taken from your environment first, the secret storage second, and the extension says which it used. A coding agent whose terms serve third parties with an API key only is not started on a subscription login.
- **Datalayer: Start a coding agent here** starts one in the open folder (the harness from the catalogue; the application the blank one or one of the folder's Appspecs) and opens its session in the Datalayer Chat.

Your folder's own `CLAUDE.md`, `AGENTS.md`, `GEMINI.md` or `.goosehints` is kept as it is: the coding agent reads it as its own. The application's instructions are written beside it, under `.datalayer/` (read-only to the agent), and handed to it ahead of the first prompt; the session's first line says so.

An _ask me first_ request is an editor notification and the chat's banner; what the agent ran is in a read-only terminal as it streams; a file it changed opens in the diff view. Signed in, the local runtime is given your Datalayer token and reads your organization's Shield policies; signed out, the local policy file alone.
