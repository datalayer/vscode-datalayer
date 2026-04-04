# Implementation Plan: Lexical Comments Plugin with Node-Based Storage

## Overview

Integrate the `CommentPlugin` from `@datalayer/jupyter-lexical` into the VS Code extension's Lexical editor by **storing comment data as Lexical nodes** that automatically sync via the existing Loro collaboration provider.

**Issue:** https://github.com/datalayer/vscode-datalayer/issues/124

**User Requirements:**

- ✅ Comments sync in real-time when collaborating (via existing Loro provider)
- ✅ Comments stored in document JSON (persisted with content as Lexical nodes)
- ✅ Toolbar toggle button to show/hide comments panel
- ✅ Username from Datalayer auth, fallback to OS username
- ✅ Keep existing CommentPlugin UI/threading features

**Current Status:**

- ✅ MarkNode already registered (LexicalEditor.tsx:357) - syncs via Loro
- ✅ CommentPlugin CSS already bundled (@datalayer/jupyter-lexical/style/index.css)
- ✅ Username already in CollaborationConfig (LexicalEditor.tsx:86)
- ✅ Custom node examples exist (CounterNode, ImageNode, JupyterCellNode)
- ❌ `@lexical/mark` package NOT installed (required dependency)
- ❌ CommentThreadNode not yet created
- ❌ CommentStore refactoring needed (currently uses Yjs)
- ❌ Toolbar button not implemented

---

## Architecture: Comments as Lexical Nodes

### Current Problem

CommentPlugin uses **dual CRDT architecture**:

- MarkNode (highlights) → Syncs via Loro ✓
- Comment metadata → Stored in Yjs YArray ✗ (separate CRDT!)

### New Solution

Store comment data as **Lexical nodes** that sync via Loro:

```
Editor State (Lexical)
├── ParagraphNode (syncs via Loro)
├── MarkNode (syncs via Loro) ← highlights
├── CommentThreadNode (syncs via Loro) ← NEW! comment data
│   ├── __id: string (thread ID, matches MarkNode ID)
│   ├── __quote: string (selected text)
│   ├── __comments: Comment[] (all replies)
│   ├── exportJSON() → Persists to document
│   ├── importJSON() → Loads from document
│   └── decorate() → Returns CommentUI component
└── Other nodes...
```

### Benefits

1. **Single CRDT**: Loro handles everything (no Yjs needed!)
2. **Single source of truth**: Lexical editor state contains all data
3. **Automatic sync**: Comments sync like all other nodes
4. **Automatic persistence**: `exportJSON()`/`importJSON()` handle document I/O
5. **Reuse existing UI**: Keep all CommentPlugin UI components unchanged

---

## Implementation Steps

### Step 1: Create CommentThreadNode (jupyter-lexical package)

**New File:** `/Users/goanpeca/Desktop/develop/datalayer/jupyter-ui/packages/lexical/src/nodes/CommentThreadNode.tsx`

**Purpose:** Store comment thread data as a Lexical node that auto-syncs via Loro.

**Implementation:**

```typescript
import { DecoratorNode, type EditorConfig, type LexicalEditor, type NodeKey } from 'lexical';

export type Comment = {
  author: string;
  content: string;
  deleted: boolean;
  id: string;
  timeStamp: number;
  type: 'comment';
};

export type SerializedCommentThreadNode = {
  type: 'comment-thread';
  version: 1;
  id: string;
  quote: string;
  comments: Comment[];
};

export class CommentThreadNode extends DecoratorNode<JSX.Element> {
  __id: string;
  __quote: string;
  __comments: Comment[];

  static getType(): string {
    return 'comment-thread';
  }

  static clone(node: CommentThreadNode): CommentThreadNode {
    return new CommentThreadNode(
      node.__id,
      node.__quote,
      node.__comments,
      node.__key
    );
  }

  static importJSON(json: SerializedCommentThreadNode): CommentThreadNode {
    return new CommentThreadNode(json.id, json.quote, json.comments);
  }

  exportJSON(): SerializedCommentThreadNode {
    return {
      type: 'comment-thread',
      version: 1,
      id: this.__id,
      quote: this.__quote,
      comments: this.__comments,
    };
  }

  constructor(id: string, quote: string, comments: Comment[], key?: NodeKey) {
    super(key);
    this.__id = id;
    this.__quote = quote;
    this.__comments = comments;
  }

  createDOM(_config: EditorConfig): HTMLElement {
    // Return invisible div - UI rendered via decorate()
    const div = document.createElement('div');
    div.style.display = 'none';
    return div;
  }

  updateDOM(): boolean {
    return false;
  }

  // Accessors
  getId(): string { return this.__id; }
  getQuote(): string { return this.__quote; }
  getComments(): Comment[] { return this.__comments; }

  // Mutators (create writable copy)
  addComment(comment: Comment): void {
    const writable = this.getWritable();
    writable.__comments = [...writable.__comments, comment];
  }

  deleteComment(commentId: string): void {
    const writable = this.getWritable();
    writable.__comments = writable.__comments.map(c =>
      c.id === commentId ? { ...c, deleted: true, content: '[Deleted Comment]' } : c
    );
  }

  decorate(_editor: LexicalEditor): JSX.Element {
    // Return null for now - UI will be in CommentPlugin
    return <></>;
  }
}

export function $createCommentThreadNode(
  id: string,
  quote: string,
  comments: Comment[]
): CommentThreadNode {
  return new CommentThreadNode(id, quote, comments);
}

export function $isCommentThreadNode(node: unknown): node is CommentThreadNode {
  return node instanceof CommentThreadNode;
}
```

---

### Step 2: Refactor CommentStore to Use Lexical Nodes

**File:** `/Users/goanpeca/Desktop/develop/datalayer/jupyter-ui/packages/lexical/src/components/Commenting.tsx`

**Changes:**

1. Remove `_collabProvider` field (no longer needed)
2. Remove `_getCollabComments()` method (no Yjs)
3. Refactor `getComments()` to read from Lexical nodes:

   ```typescript
   getComments(): Comments {
     const threads: Comments = [];
     this._editor.getEditorState().read(() => {
       const root = $getRoot();
       root.getChildren().forEach(node => {
         if ($isCommentThreadNode(node)) {
           threads.push({
             type: 'thread',
             id: node.getId(),
             quote: node.getQuote(),
             comments: node.getComments(),
           });
         }
       });
     });
     return threads;
   }
   ```

4. Refactor `addComment()` to update Lexical nodes:

   ```typescript
   addComment(commentOrThread: Comment | Thread, thread?: Thread): void {
     this._editor.update(() => {
       if (thread !== undefined && commentOrThread.type === 'comment') {
         // Add comment to existing thread
         const root = $getRoot();
         root.getChildren().forEach(node => {
           if ($isCommentThreadNode(node) && node.getId() === thread.id) {
             node.addComment(commentOrThread);
           }
         });
       } else if (commentOrThread.type === 'thread') {
         // Create new thread node
         const threadNode = $createCommentThreadNode(
           commentOrThread.id,
           commentOrThread.quote,
           commentOrThread.comments
         );
         $getRoot().append(threadNode);
       }
     });
     triggerOnChange(this);
   }
   ```

5. Refactor `deleteCommentOrThread()` similarly
6. Remove `registerCollaboration()` method (not needed)
7. Remove all Yjs-related code

---

### Step 3: Install Missing Dependency (vscode-datalayer)

**File:** `/Users/goanpeca/Desktop/develop/datalayer/vscode-datalayer/package.json`

**Add:**

```json
"dependencies": {
  "@lexical/mark": "^0.35.0"
}
```

**Command:**

```bash
cd /Users/goanpeca/Desktop/develop/datalayer/vscode-datalayer
npm install @lexical/mark@^0.35.0
```

---

### Step 4: Register CommentThreadNode (vscode-datalayer)

**File:** `webview/lexical/LexicalEditor.tsx`

**Location:** Line ~357 (in nodes array)

**Add import:**

```typescript
import { CommentThreadNode } from "@datalayer/jupyter-lexical";
```

**Add to nodes array:**

```typescript
nodes: [
  // ... existing nodes
  MarkNode, // Already present
  CommentThreadNode, // ADD THIS
  // ...
];
```

---

### Step 5: Add Comments Panel Visibility State (vscode-datalayer)

**File:** `webview/lexical/LexicalEditor.tsx`

**Location:** After line 308 (with other useState declarations)

**Add:**

```typescript
const [showCommentsPanel, setShowCommentsPanel] = useState(false);
```

---

### Step 6: Add CommentPlugin to Plugin Tree (vscode-datalayer)

**File:** `webview/lexical/LexicalEditor.tsx`

**Location:** After line 577 (after InternalCommandsPlugin)

**Add:**

```typescript
{/* Comments Plugin - Uses Lexical nodes, syncs via Loro */}
<CommentPlugin providerFactory={undefined} showCommentsPanel={showCommentsPanel} />
```

**Note:** `providerFactory={undefined}` tells CommentPlugin NOT to use Yjs (we're using Lexical nodes instead).

---

### Step 7: Add Toolbar Toggle Button (vscode-datalayer)

**File:** `webview/lexical/LexicalToolbar.tsx`

**Update Props Interface (Line 92):**

```typescript
/** Whether comments panel is visible */
showCommentsPanel?: boolean;
/** Callback to toggle comments panel */
onToggleComments?: () => void;
```

**Add Button (After line 1338):**

```typescript
{/* Comments Toggle */}
<div className="toolbar-item" title="Toggle Comments Panel">
  <button
    type="button"
    className="toolbar-button"
    onClick={onToggleComments}
    disabled={disabled}
    style={{
      backgroundColor: showCommentsPanel
        ? 'var(--vscode-toolbar-hoverBackground)'
        : 'transparent',
    }}
  >
    <i className="codicon codicon-comment-discussion" />
  </button>
</div>
```

**Pass Props from LexicalEditor (Line 492):**

```typescript
<LexicalToolbar
  disabled={!editable}
  selectedRuntime={selectedRuntime}
  showRuntimeSelector={showRuntimeSelector}
  showCollaborativeLabel={collaboration?.enabled}
  showCommentsPanel={showCommentsPanel}  // ADD
  onToggleComments={() => setShowCommentsPanel(!showCommentsPanel)}  // ADD
  lexicalId={lexicalId || undefined}
/>
```

---

### Step 8: Export CommentThreadNode from Package (jupyter-lexical)

**File:** `/Users/goanpeca/Desktop/develop/datalayer/jupyter-ui/packages/lexical/src/index.ts`

**Add export:**

```typescript
export {
  CommentThreadNode,
  $createCommentThreadNode,
  $isCommentThreadNode,
} from "./nodes/CommentThreadNode";
export type {
  Comment,
  SerializedCommentThreadNode,
} from "./nodes/CommentThreadNode";
```

---

### Step 9: Update CommentPlugin Props (jupyter-lexical)

**File:** `/Users/goanpeca/Desktop/develop/datalayer/jupyter-ui/packages/lexical/src/plugins/CommentPlugin.tsx`

**Add prop:**

```typescript
export function CommentPlugin({
  providerFactory,
  showCommentsPanel = true, // ADD THIS
}: {
  providerFactory?: (
    id: string,
    yjsDocMap: Map<string, Doc>,
  ) => WebsocketProvider;
  showCommentsPanel?: boolean; // ADD THIS
}): JSX.Element {
  // ... use showCommentsPanel to control visibility
}
```

---

## Build & Publish Process

### 1. Build jupyter-lexical Package

```bash
cd /Users/goanpeca/Desktop/develop/datalayer/jupyter-ui/packages/lexical
npm run build
```

### 2. Publish jupyter-lexical (if needed)

```bash
npm version patch  # or minor/major
npm publish
```

### 3. Update vscode-datalayer Dependency

```bash
cd /Users/goanpeca/Desktop/develop/datalayer/vscode-datalayer
npm install @datalayer/jupyter-lexical@latest
npm install
```

### 4. Build vscode-datalayer

```bash
npm run compile
```

---

## Testing Checklist

### Unit Tests (jupyter-lexical package)

1. **CommentThreadNode Serialization:**

   ```bash
   npm test -- CommentThreadNode.test.ts
   ```

   - ✅ `exportJSON()` produces correct structure
   - ✅ `importJSON()` restores node correctly
   - ✅ Clone creates independent copy

2. **CommentStore with Nodes:**
   - ✅ `getComments()` reads from CommentThreadNodes
   - ✅ `addComment()` creates/updates nodes
   - ✅ `deleteComment()` marks comments as deleted

### Integration Tests (vscode-datalayer)

1. **Install dependencies and build:**

   ```bash
   npm install
   npm run compile
   ```

2. **Launch Extension Development Host:**
   - Press F5 in VS Code

3. **Test Basic Comment Creation:**
   - Create new file: `test-comments.dlex`
   - Select text
   - Add comment
   - ✅ MarkNode wraps text (yellow highlight)
   - ✅ CommentThreadNode created in editor state
   - ✅ Comment appears in panel

4. **Test Comments Panel Toggle:**
   - Click toolbar button
   - ✅ Panel opens/closes

5. **Test Comment Threading:**
   - Reply to comment
   - ✅ Reply appears indented
   - ✅ CommentThreadNode updated with new comment

6. **Test Comment Deletion:**
   - Delete comment
   - ✅ Shows "[Deleted Comment]"
   - ✅ MarkNode removed if thread deleted

7. **Test Persistence:**
   - Save document
   - Close editor
   - Reopen
   - ✅ Comments reload from JSON
   - ✅ MarkNode highlights reappear

8. **Test Real-Time Collaboration:**
   - Open same document in two VS Code windows
   - Add comment in window 1
   - ✅ **Expected:** Comment appears in window 2 immediately (syncs via Loro!)
   - ✅ **Expected:** Both MarkNode and CommentThreadNode sync

---

## Success Criteria

### Core Features

- ✅ Comments toolbar button visible
- ✅ Can create comment on selected text
- ✅ MarkNode wraps commented text with highlight
- ✅ CommentThreadNode stores comment data
- ✅ Comments panel displays all comments
- ✅ Can reply to comments (threading works)
- ✅ Can delete comments
- ✅ Comments persist across editor sessions
- ✅ Username displays correctly (auth or OS fallback)

### Collaboration (Automatic!)

- ✅ Comments sync in real-time via Loro CRDT
- ✅ MarkNode syncs (highlights visible to all)
- ✅ CommentThreadNode syncs (comment content visible to all)
- ✅ No conflicts when multiple users comment simultaneously
- ✅ Single CRDT system (Loro) - no Yjs dependency

### Data Integrity

- ✅ Comments stored in Lexical JSON format
- ✅ Comments part of document undo/redo history
- ✅ No separate database or sync mechanism needed

---

## Critical Files to Modify

### jupyter-lexical Package

| File                              | Changes                                                   | Lines |
| --------------------------------- | --------------------------------------------------------- | ----- |
| `src/nodes/CommentThreadNode.tsx` | NEW - Custom node for storing comment threads             | ~170  |
| `src/components/Commenting.tsx`   | Refactor CommentStore to use Lexical nodes instead of Yjs | ~50   |
| `src/plugins/CommentPlugin.tsx`   | Add `showCommentsPanel` prop                              | ~5    |
| `src/index.ts`                    | Export CommentThreadNode                                  | ~2    |

### vscode-datalayer Extension

| File                                 | Changes                                                        | Lines |
| ------------------------------------ | -------------------------------------------------------------- | ----- |
| `package.json`                       | Add `@lexical/mark` dependency                                 | 1     |
| `webview/lexical/LexicalEditor.tsx`  | Import CommentThreadNode, add state, render plugin, pass props | ~15   |
| `webview/lexical/LexicalToolbar.tsx` | Add props, add toggle button                                   | ~20   |

**Total LOC:** ~263 lines across both packages

---

## Key Benefits of This Approach

### 1. Single CRDT System

- **Before:** Loro (editor content) + Yjs (comments) = dual CRDTs
- **After:** Loro only = single source of truth
- **Impact:** Simpler architecture, no sync adapters needed

### 2. Comments as First-Class Citizens

- Stored in Lexical JSON format alongside other content
- Part of document undo/redo history
- Automatically persist with document save
- No separate database or API calls

### 3. Automatic Real-Time Sync

- CommentThreadNode syncs via Loro like all other nodes
- No special collaboration code needed for comments
- Works seamlessly with existing LoroCollaborationPlugin

### 4. Keep Existing UI

- Reuse all CommentPlugin React components
- Keep threading, reply, delete functionality
- Keep all CSS styling
- Only refactor data layer (CommentStore)

---

## Rollback Plan

If integration fails or causes issues:

### jupyter-lexical Package

1. Delete `src/nodes/CommentThreadNode.tsx`
2. Revert `src/components/Commenting.tsx`
3. Revert `src/plugins/CommentPlugin.tsx`
4. Revert `src/index.ts`
5. Rebuild package

### vscode-datalayer Extension

1. Remove `@lexical/mark` from package.json
2. Revert LexicalEditor.tsx
3. Revert LexicalToolbar.tsx
4. Clean rebuild:
   ```bash
   npm run clean
   npm install
   npm run compile
   ```

**Risk Level:** Low-Medium

- Changes isolated to comment feature
- Can ship without comments if needed
- Existing editor functionality unaffected

---

## Alternative Approaches Rejected

### 1. Keep Dual CRDT (Loro + Yjs)

- **Why rejected:** User explicitly requested "we should be using LORO FOR EVERYTHING"
- Complexity of maintaining two sync systems
- Potential for sync conflicts between systems

### 2. Build Custom Comments UI from Scratch

- **Why rejected:** 1000+ lines of code to reinvent existing UI
- Threading, persistence, collaboration all need implementation
- Maintenance burden for common feature

### 3. Comments as Separate Database

- **Why rejected:** Not "stored in document JSON" per requirements
- Requires API integration
- Sync complexity across multiple clients

### 4. Use Yjs for All Collaboration

- **Why rejected:** Replace entire Loro infrastructure
- Breaking change to existing working system
- Not backward compatible

---

## Summary

**What Changed:** Shifted from "Loro↔Yjs adapter" to "Comments as Lexical nodes" approach.

**Why:** User correctly identified that we control the CommentPlugin source code and should store comments in the Lexical format to sync via Loro like all other content.

**Result:**

- Single CRDT (Loro) instead of dual (Loro + Yjs)
- Comments stored in document JSON automatically
- Real-time collaboration works out-of-box
- Simpler, cleaner architecture

**Implementation:** ~263 LOC across two packages, mostly creating CommentThreadNode and refactoring CommentStore.

---

**Plan Status:** ✅ Ready for Implementation
**Created:** 2025-01-22
**Last Updated:** 2025-01-22
