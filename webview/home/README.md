# webview/home/ - The Datalayer Home Page

The _Datalayer_ home page webview (`datalayer.home`): the sidebar's blocks —
Outline, Spaces, Sessions, Agents, Settings — as sections of one page.

## Files

- **main.tsx** - Entry point: reads the initial theme from VS Code's body
  classes and mounts the page.
- **HomePage.tsx** - The page: draws the sections the extension host posts
  (read from the sidebar trees by `src/ui/home/homeSnapshot.ts`), and sends a
  click back by the node's key, so the host runs the item's own command, as
  the tree does.
