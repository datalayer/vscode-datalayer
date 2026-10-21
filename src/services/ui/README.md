# src/services/ui/ - UI Initialization

UI component initialization and management.

## Files

- **statusBar.ts** - Status bar management showing connection status and providing quick access to login/logout functionality.
- **uiSetup.ts** - UI initialization factory configuring and registering all UI components including status bar, tree views, and providers during extension activation.
- **approvalNotifications.ts** - `ApprovalNotifications`: an _ask me first_ decision said as an editor notification (_<Application> asks to Run git push (execute) — Approve · Decline · Show_), the class said and never the arguments; a decision allowed only once the chat has shown the request, sent by the chat through the one route after reading the approval again (`ApprovalDecider`).
- **diffDocuments.ts** - `DiffDocuments`: a `TextDocumentContentProvider` on `datalayer-diff:` serving the two sides of every diff opened, and `open()` comparing them with `vscode.diff` under _<path> — before · after (<harness>, turn n)_; for a local session the _after_ side is the file on disk when it holds what the agent wrote (the bytes and the SHA-256 checked), else the display's text, said. Reviewed, never applied.
- **sessionTerminal.ts** - `SessionTerminals`: one read-only `Pseudoterminal` per session (_Datalayer: <title>_) written as the session's terminal displays arrive — the command echoed, the output streamed, the exit — reused for the next command, disposed with the session's end; typing is answered in a sentence.
- **sessionStatusBar.ts** - `SessionStatusBar`: _Datalayer: n waiting for you_ (click: the first waiting session) or _Datalayer: working…_, hidden when nothing runs; a notification when a turn of a session not in front finishes or its runtime goes away. Sources merged by key: the chat (`session-state`) and any listing through `datalayer.internal.sessions.attention`.
