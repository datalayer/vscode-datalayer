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
editor's webview: the adapter posts `tool-execution` to the panel of the
document it works on (the one it was handed, else the one its arguments
name, else the active one), and `webview/services/runnerSetup.ts` runs it
there.

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
      │  decide: run / ask / refuse
      ▼  document-tool-call { locate }   → which editor? (named in the banner)
      ▼  document-tool-call { target }   → run on that one
 AgentChatViewProvider.runDocumentTool
      │  documentToolTargetOf(active tab, open editors, target)
      ▼  runRegisteredTool(name, args, { uri, kind })  ← the adapter Copilot uses
 VSCodeToolAdapter.run ──tool-execution──▶ that editor's webview panel
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

4. **Locating.** Before anything is asked or run, the page posts
   `document-tool-call` with `locate: true`. The provider answers with the
   editor the call would run on (see _The target editor_ below), or with a
   sentence that tells the agent to ask the person to open one. Nothing runs
   and nothing is asked when there is no editor.

   A write is then asked in the chat's own approval banner, next to the
   runtime's approvals: _The agent asks to run datalayer_insertCell on
   analysis.ipynb._ Its id starts with `vscode-tool:`, and the banner's
   Approve and Reject buttons answer it in the page. A declined call is
   answered "nothing was changed".

5. **Running.** The page posts `document-tool-call` again, with
   `target: <the located editor's uri>`. The provider runs the call on that
   editor while it is still open, and refuses it once it was closed. It never
   runs the call on another editor, even when focus moved meanwhile. The
   provider parses any JSON-text arguments and runs the tool through
   `runRegisteredTool(name, args, { uri, kind })`. That is the same
   `VSCodeToolAdapter` that Copilot's calls go through
   (`VSCodeToolAdapter.run`), with the same operations, formatting
   (`datalayer.tools.responseFormat`) and webview bridge.
6. **Answering.** The provider answers with `document-tool-result`, which
   carries `{ editor: { kind, name, uri }, note?, result }` or `{ error }`.
   The page hands the run `{ success, editor, note?, result | error }`, so
   the agent always knows which editor it worked on. The handler never
   throws: a thrown frontend tool would leave the run waiting.

An application's transcript shows these calls as _App → VS Code: tool on
analysis.ipynb_. The file name is added once the call is located. In the chat
with the person's own runtimes, the tool's card says _on analysis.ipynb_ once
the call returned (`summaryOf`, which agent-runtimes' `<Chat>` reads from a
frontend tool), in place of its arguments' summary.

## The target editor

Datalayer notebooks (`.ipynb` in `datalayer.jupyter-notebook`) and documents
(`.dlex` in `datalayer.lexical-editor`) are custom editors, which means
webview panels. For them `activeTextEditor` is `undefined`. When focus moves
into the chat sidebar, the Terminal or another panel, the active tab can be
another file or nothing at all. The document registry
(`src/services/documents/documentRegistry.ts`) therefore tracks the open
Datalayer editors:

- `register` (called by both custom editor providers in
  `resolveCustomEditor`) records the panel. A panel opened in front counts
  as focused.
- `onDidChangeViewState` marks a panel focused each time it becomes
  `active`. Moving away from it changes nothing.
- `onDidDispose` unregisters the document, unless a newer panel was
  registered for the same URI.
- `openEditors()` lists `{ documentUri, type, focusedAt }`.

`documentToolTargetOf` (pure, in `src/chat/documentTools.ts`) chooses the
editor:

1. **The editor located before** (`target`), while it is still open and of
   the right kind. If it was closed, the call is refused: _a.ipynb was
   closed before the tool ran: nothing was changed._
2. **The active tab**, when it is a Datalayer editor of the kind the tool
   needs (`notebook`, `lexical`, or either for `any`).
3. **The open editor of that kind focused last**. The outcome then carries a
   `note`: _b.ipynb is not the active tab: it is the Datalayer notebook
   focused last (of 2 open). Tell the person which file you acted on._
4. **None.** The call is refused: _No Datalayer notebook is open in VS
   Code: ask the person to open one and call the tool again._

Native VS Code notebooks are never targets. An editor of the other kind is
never used for a tool that needs one kind.

### Routing to the editor's webview

`VSCodeToolAdapter.run(input, target)` builds the operation's context for
the target. `documentId` is the registry's ID for the target URI (a remote
document's UID), and the executor posts each `tool-execution` to
`documentRegistry.getWebviewPanel(target.uri)`. It never posts to the active
panel. If the target has no panel (closed, or still loading), the call fails
with a sentence and nothing is posted. The two operations that serve either
editor (`executeCode`, `getActiveDocument`) read the target from
`extras.targetDocument` (`targetDocumentInfo`) before they look at the
active tab.

Copilot's calls pass no target. They work on the document the arguments
name (`notebook_uri`, `documentUri`), else the active one, and their
messages now go to that document's panel too.

## Files

- `src/chat/documentTools.ts`: specs, decision, target resolution and
  wording.
  It is pure, and both the host and the page import it.
- `src/tools/core/registration.ts`: `registeredToolDefinitions` and
  `runRegisteredTool`.
- `src/tools/core/toolAdapter.ts`: `VSCodeToolAdapter.run`, which is shared
  by `invoke` (Copilot) and the chat.
- `src/providers/agentChatViewProvider.ts`: `document-tools`,
  `document-tool-call` and `document-tool-result`.
- `webview/agentChat/documentTools.ts`, `App.tsx`, `AppChat.tsx` and
  `main.tsx`: the hook, its two chats and the message plumbing.
- `src/services/documents/documentRegistry.ts`: the open editors and the
  one focused last.
- Tests: `webview/test/documentTools.test.ts` (specs, decisions, target
  resolution, the hook), `webview/test/documentToolsProvider.test.ts` (the
  host's side) and `webview/test/documentToolRouting.test.ts` (the
  registry's focus tracking, and the adapter posting to the target's
  panel).
