# Editor tools for the Datalayer Chat's agents

How the agents talked to in the Datalayer Chat sidebar read and change the
open Datalayer notebook (`.ipynb` in the Datalayer editor) or document
(`.dlex`).

## The tools, and who calls them

One registry holds the tools (`src/tools/core/registration.ts`):

| Source                                   | Tools                                                                                                                                                                                                                                            |
| ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `@datalayer/jupyter-react/tools` (cells) | `datalayer_insertCell`, `datalayer_updateCell`, `datalayer_deleteCells`, `datalayer_readCell`, `datalayer_readAllCells`, `datalayer_runCell`, `datalayer_executeCodeInNotebook`                                                                  |
| `@datalayer/jupyter-lexical` (blocks)    | `datalayer_insertBlock`, `datalayer_updateBlock`, `datalayer_deleteBlocks`, `datalayer_readBlock`, `datalayer_readAllBlocks`, `datalayer_runBlock`, `datalayer_runAllBlocks`, `datalayer_listAvailableBlocks`, `datalayer_executeCodeInDocument` |
| The extension (`src/tools/operations`)   | `datalayer_getActiveDocument`, `datalayer_executeCode`, `datalayer_createNotebook`, `datalayer_createLexical`, `datalayer_listKernels`, `datalayer_selectKernel`                                                                                 |

`registerVSCodeTools` registers each one with `vscode.lm.registerTool`
through a `VSCodeToolAdapter`; `package.json`'s `languageModelTools` lists
them (`scripts/sync-package-json.ts`). A cell or block operation runs in the
editor's webview: the adapter posts `tool-execution` to the active Datalayer
editor's panel, and `webview/services/runnerSetup.ts` runs it there.

Callers:

- **GitHub Copilot** (agent mode, `#` references) calls them as Language
  Model tools.
- **The `@datalayer` chat participant** (`src/chat/datalayerChatParticipant.ts`)
  hands them to a Copilot model with `vscode.lm.invokeTool`.
- **The Datalayer Chat sidebar's agents** (the person's runtimes, a
  session opened from the Sessions view, a deployed application) call them as
  AG-UI frontend tools. This is described below.

## What CopilotKit was, and what was lost

There was once a `datalayer.showAgUIExample` command. It opened a panel built
with CopilotKit (`useCopilotAction` over agent-runtimes' CopilotKit adapter)
in which an agent could edit a notebook. The panel's source was never in this
repository, and its webpack entry was commented out. The command was removed
together with that entry. The sidebar's chat is agent-runtimes' `<Chat>`, and
no CopilotKit is used anywhere.

The only real gap was this: the sidebar's agents were given no editor tools.
The one frontend tool they had was `host_context`, which an application's
agent uses to read the open text file when its Appspec allows it. The
notebook and document tools reached Copilot only.

## The design

```
<Chat frontendTools>  ──run tools──▶  agent-runtimes (AG-UI / Vercel AI)
      ▲                                    │ ExternalToolset: a call is
      │ tool result                        ▼ handed back to the page
 webview/agentChat/documentTools.ts  ◀── TOOL_CALL_* events
      │  decide: run / ask in the banner / refuse
      ▼  document-tool-call
 AgentChatViewProvider.runDocumentTool
      │  active Datalayer editor? (getActiveDocumentInfo)
      ▼  runRegisteredTool(name, args)   ← the adapter Copilot uses
 VSCodeToolAdapter.run ──tool-execution──▶ the editor's webview
```

1. **Listing.** When the page posts `ready`, and again on each refresh, the
   provider posts `document-tools`. This message carries the chat's tools
   (`documentToolSpecsOf` in `src/chat/documentTools.ts`): every registered
   tool tagged `notebook` or `lexical`, except creating a document and
   listing or selecting a kernel, because those open VS Code's own pickers.
   Each spec says whether the tool **writes** (insert, update, delete, run,
   execute) and which editor it needs (`notebook`, `lexical` or `any`).
2. **Advertising.** `useDocumentTools` (in `webview/agentChat/documentTools.ts`)
   turns the specs into `<Chat frontendTools>`. `<Chat>` lists them in each
   run's `tools`, which is `RunAgentInput.tools` for AG-UI and the body's
   `tools` for Vercel AI. The runtime adds them as an `ExternalToolset`, so a
   call is handed back to the page and never runs on the runtime.
3. **Deciding.** The runtime never runs these calls, so its own approvals
   (the Shield, an application's rules, the local runtime's approvals) never
   see them. The page decides them with `documentToolDecision`:
   - For an **application**, the rule of its Appspec that names the tool is
     used first. If no rule names it, the rule for its class (`read` or
     `write`) is used. `do_it` runs the tool, `ask_first` and `if_asked` ask
     the person, and `leave_to_me` refuses it.
   - With **no rule**, or for an agent of the person's **own runtime**, a tool
     that only reads runs, and a tool that writes is asked first.

   The request appears in the chat's own approval banner, next to the
   runtime's approvals. Its id starts with `vscode-tool:`, and the banner's
   Approve and Reject buttons answer it in the page. A declined call is
   answered "nothing was changed".

4. **Running.** The page posts `document-tool-call`. The provider checks that
   the active editor tab is a Datalayer editor of the kind the tool needs. If
   it is not, the call is refused with a sentence asking the person to open
   one. If it is, the provider parses any JSON-text arguments and runs the
   tool through `runRegisteredTool`. That is the same `VSCodeToolAdapter`
   that Copilot's calls go through (`VSCodeToolAdapter.run`), with the same
   operations, formatting (`datalayer.tools.responseFormat`) and webview
   bridge.
5. **Answering.** The provider answers with `document-tool-result`, which
   carries `{ editor: { kind, name, uri }, result }` or `{ error }`. The page
   hands the run `{ success, editor, result | error }`, so the agent always
   knows which editor it worked on. The handler never throws: a thrown
   frontend tool would leave the run waiting.

An application's transcript shows these calls as _App → VS Code: tool_.

## The target editor

The tool targets the **active editor tab**, which must be a Datalayer
notebook (`datalayer.jupyter-notebook`) or document
(`datalayer.lexical-editor`). Focusing the sidebar does not change the active
tab. Native VS Code notebooks are not targets. To point the agent at another
file, bring that file to the front.

## Files

- `src/chat/documentTools.ts`: specs, decision, target check and wording.
  It is pure, and both the host and the page import it.
- `src/tools/core/registration.ts`: `registeredToolDefinitions` and
  `runRegisteredTool`.
- `src/tools/core/toolAdapter.ts`: `VSCodeToolAdapter.run`, which is shared
  by `invoke` (Copilot) and the chat.
- `src/providers/agentChatViewProvider.ts`: `document-tools`,
  `document-tool-call` and `document-tool-result`.
- `webview/agentChat/documentTools.ts`, `App.tsx`, `AppChat.tsx` and
  `main.tsx`: the hook, its two chats and the message plumbing.
- Tests: `webview/test/documentTools.test.ts` (specs, decisions, the hook)
  and `webview/test/documentToolsProvider.test.ts` (the host's side).
