# src/ui/home/ - The Datalayer Home Page's Data

The extension-host side of the _Datalayer_ home page (`datalayer.home`): the
sidebar's blocks — Outline, Spaces, Sessions, Agents, Settings — read from
their own tree providers and posted to the page as plain nodes.

## Files

- **homeSnapshot.ts** - Pure (no `vscode` import): asks a tree provider for
  its items a few levels deep (`getChildren()`, `getTreeItem()`) and turns
  each item into a serializable node — label, description, tooltip, icon id,
  command, contextValue, children. The keys are the path of indexes, so a
  click sent back by key runs the item's own command with its own arguments,
  kept on the host. Also checks the page's messages (`pageMessageOf`).

The panel itself is registered in `src/commands/home.ts`; the page is drawn by
`webview/home/`.
