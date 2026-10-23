# Talk to your agents

An application you built and deployed in the Datalayer Agent Studio answers in VS Code, in the **Datalayer Chat** sidebar. It is on by default. Turn it off with the **Datalayer › Agent Chat: Enabled** setting (`datalayer.agentChat.enabled`): the sidebar then lists no application and asks Datalayer nothing about them. Your runtimes' chat works the same either way.

## Open a conversation

1. Sign in: **Datalayer: Login to Datalayer**.
2. In the Studio, open the application's **Ship** tab and turn on **Always on**. VS Code talks to the runtime the deployment is kept on.
3. Open the **Datalayer Chat** sidebar and pick the application under **Your applications**. A deployment that cannot be talked to is listed under **Not available here**, with the reason: paused, not live, not kept always on, or its runtime not running.
4. Talk to it. The conversation is a session of the deployment, in your name, through the same session API as its hosted page.

## Your runtimes and snapshots

The **Agents** block of the Datalayer sidebar (and of the **Datalayer: Home** page) lists your runtimes and your snapshots.

- **Click a runtime** to open the **Datalayer Chat** with that agent picked. A runtime that runs a deployed application is talked to as its application, under **Your applications**; one still starting may need **Refresh agents** (↻) first.
- **Click a snapshot** to open its details in an editor tab: name, description, environment, date, size, format, language, metadata, files and ID, with **Restore from Snapshot** and **Delete Snapshot**. Deleting it closes the tab.
- **Create an agent** from the **+** of the Agents block, or from the **+** beside the agent picker at the top of the Datalayer Chat: both run the same flow.

## What the chat shows

- **Approvals**: when one of its rules says _ask me first_, the request appears in the chat, where you approve or decline it. The editor also shows a notification naming the application, the action and its class (_execute_, _write_, _delete_…), never what it would run, with **Approve**, **Decline** and **Show**. A decision from the notification is taken only after the chat has shown the request and the approval was read again; one answered elsewhere is said so.
- **Diffs**: what a coding agent changed in a file is drawn in the chat as a diff. **Open in the editor** opens it in the diff view, _before_ and _after_. The editor reviews a diff; it never applies one.
- **Terminals**: what the agent ran is written, as it runs, to a read-only terminal named after the session: the command, its output, its exit.
- **The status bar**: _Datalayer: 2 waiting for you_ while sessions wait on you (click to open the first), _Datalayer: working…_ while a turn runs. A session the chat does not show tells you when its turn finishes, in a notification.
- **What it did**: under the chat, each tool it called, as a line, for example `Support Desk → odoo-accounting: odoo_accounting_aged_balance`.

## Your open file

Only when the application lets its host pass the page (`deployment.embedded.host.context: [page]` in its Appspec) and a rule lets `host_context` run: when its agent asks, it gets the file open in your editor (its path, language, text up to 20,000 characters, and the selection). Nothing is read before it asks.

## Signed users

An application that takes only a signed user (`deployment.embedded.host.user: signed`) is opened with a short user token Datalayer signs for you (fifteen minutes). The extension host asks for it with your token and sends it with each run; the sidebar never holds it. Only the deployed version decides: an application saved since is not opened until that version is deployed.

## Try an application while you build it

**Datalayer: Try this application** opens the application of the open Appspec beside the editor, with hot reload. Its Validate and Ship tabs open in the browser from the same menu.
