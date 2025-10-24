# Migration Guide: Old Tools → Unified Architecture

This guide helps you migrate from the old manual tool implementation to the new unified architecture.

## Table of Contents

1. [Overview of Changes](#overview-of-changes)
2. [Before and After Comparison](#before-and-after-comparison)
3. [Step-by-Step Migration](#step-by-step-migration)
4. [Breaking Changes](#breaking-changes)
5. [Migration Checklist](#migration-checklist)
6. [Rollback Instructions](#rollback-instructions)

---

## Overview of Changes

### What's Changing?

**Old Implementation:**
- Manual tool registration in [extension.ts](../../extension.ts)
- Tight coupling to VS Code APIs
- Duplicate tool definitions (TypeScript + package.json)
- No code reuse across platforms
- Difficult to test

**New Implementation:**
- Factory-based automatic registration
- Platform-agnostic core operations
- Single source of truth for tool definitions
- 90%+ code reuse (VS Code, SaaS, ag-ui)
- Easy unit testing with MockDocumentHandle

### Why Migrate?

✅ **Code Reuse**: Write once, run on VS Code, web, and ag-ui
✅ **Maintainability**: Single source of truth reduces errors
✅ **Testability**: Pure functions with mock implementations
✅ **ag-ui Compatible**: Built-in CopilotKit support
✅ **Future-Proof**: Easy to add new platforms

---

## Before and After Comparison

### Old: Manual Tool Registration

```typescript
// OLD: extension.ts (manual registration)
import * as vscode from 'vscode';

export function activate(context: vscode.ExtensionContext) {
  // Register each tool manually
  context.subscriptions.push(
    vscode.lm.registerTool('datalayer_insertCell', {
      async prepareInvocation(options, _token) {
        return {
          invocationMessage: `Inserting ${options.input.cellType} cell`,
          confirmationMessages: {
            title: 'Insert Cell',
            message: new vscode.MarkdownString(
              `Insert **${options.input.cellType}** cell?`
            ),
          },
        };
      },

      async invoke(options, _token) {
        // Tightly coupled to VS Code APIs
        const cellType = options.input.cellType;
        const cellSource = options.input.cellSource;
        const cellIndex = options.input.cellIndex;

        // Execute VS Code command
        await vscode.commands.executeCommand(
          'datalayer.internal.insertCell',
          { cellType, cellSource, cellIndex }
        );

        return new vscode.LanguageModelToolResult([
          new vscode.LanguageModelTextPart(
            `✅ Inserted ${cellType} cell at index ${cellIndex}`
          ),
        ]);
      },
    })
  );

  // Repeat for every tool... 😓
}
```

**Problems with old approach:**
- ❌ 50+ lines per tool
- ❌ No code reuse (can't use in web)
- ❌ Hard to test (requires VS Code environment)
- ❌ Duplicate definitions (package.json + TypeScript)

### New: Factory Registration

```typescript
// NEW: extension.ts (one line!)
import { registerVSCodeTools } from './tools/adapters/vscode/registration';

export function activate(context: vscode.ExtensionContext) {
  // Register all tools automatically
  registerVSCodeTools(context);
}
```

**Benefits of new approach:**
- ✅ 1 line replaces 50+ lines per tool
- ✅ Works on VS Code, SaaS, and ag-ui
- ✅ Fully unit testable
- ✅ Single source of truth

---

## Step-by-Step Migration

### Step 1: Backup Current Implementation

```bash
# Create a backup branch
cd /Users/goanpeca/Desktop/develop/datalayer/vscode-datalayer
git checkout -b backup-old-tools
git commit -am "Backup: Old tool implementation"
git checkout main
```

### Step 2: Update extension.ts

Replace manual tool registration with factory:

```typescript
// src/extension.ts
import * as vscode from 'vscode';
import { registerVSCodeTools } from './tools/adapters/vscode/registration';

export function activate(context: vscode.ExtensionContext) {
  console.log('🚀 Datalayer extension activating...');

  // ===== NEW: Replace manual tool registration with this =====
  registerVSCodeTools(context);
  // ===========================================================

  // Keep existing code for:
  // - Authentication provider
  // - Custom editor provider
  // - Tree view providers
  // - Status bar
  // - Commands

  console.log('✅ Datalayer extension activated');
}
```

**What to remove:**
```typescript
// ❌ REMOVE: Old manual tool registrations
context.subscriptions.push(
  vscode.lm.registerTool('datalayer_insertCell', { /* ... */ })
);
context.subscriptions.push(
  vscode.lm.registerTool('datalayer_deleteCell', { /* ... */ })
);
// ... etc
```

### Step 3: Implement Internal Commands

The new architecture uses message passing. Add internal command handlers:

```typescript
// src/extension.ts
function registerInternalCommands(context: vscode.ExtensionContext) {
  // Insert Cell
  context.subscriptions.push(
    vscode.commands.registerCommand(
      'datalayer.internal.insertCell',
      async (args: {
        uri: string;
        cellType: string;
        cellSource: string;
        cellIndex: number;
      }) => {
        const panel = getWebviewPanel(args.uri);
        await panel.webview.postMessage({
          type: 'insertCell',
          ...args,
        });
        return await waitForResponse(panel, 'insertCellResponse');
      }
    )
  );

  // Read Cell
  context.subscriptions.push(
    vscode.commands.registerCommand(
      'datalayer.internal.readCell',
      async (args: { uri: string; cellIndex: number }) => {
        const panel = getWebviewPanel(args.uri);
        await panel.webview.postMessage({
          type: 'readCell',
          cellIndex: args.cellIndex,
        });
        return await waitForResponse(panel, 'readCellResponse');
      }
    )
  );

  // Read All Cells
  context.subscriptions.push(
    vscode.commands.registerCommand(
      'datalayer.internal.readAllCells',
      async (args: { uri: string }) => {
        const panel = getWebviewPanel(args.uri);
        await panel.webview.postMessage({ type: 'readAllCells' });
        return await waitForResponse(panel, 'readAllCellsResponse');
      }
    )
  );

  // Delete Cell
  context.subscriptions.push(
    vscode.commands.registerCommand(
      'datalayer.internal.deleteCell',
      async (args: { uri: string; cellIndex: number }) => {
        const panel = getWebviewPanel(args.uri);
        await panel.webview.postMessage({
          type: 'deleteCell',
          cellIndex: args.cellIndex,
        });
        return await waitForResponse(panel, 'deleteCellResponse');
      }
    )
  );

  // Update Cell
  context.subscriptions.push(
    vscode.commands.registerCommand(
      'datalayer.internal.updateCell',
      async (args: {
        uri: string;
        cellIndex: number;
        newSource: string;
      }) => {
        const panel = getWebviewPanel(args.uri);
        await panel.webview.postMessage({
          type: 'updateCell',
          cellIndex: args.cellIndex,
          newSource: args.newSource,
        });
        return await waitForResponse(panel, 'updateCellResponse');
      }
    )
  );

  // Execute Cell
  context.subscriptions.push(
    vscode.commands.registerCommand(
      'datalayer.internal.executeCell',
      async (args: { uri: string; cellIndex: number }) => {
        const panel = getWebviewPanel(args.uri);
        await panel.webview.postMessage({
          type: 'executeCell',
          cellIndex: args.cellIndex,
        });
        return await waitForResponse(panel, 'executeCellResponse');
      }
    )
  );

  // Get Notebook Info
  context.subscriptions.push(
    vscode.commands.registerCommand(
      'datalayer.internal.getNotebookInfo',
      async (args: { uri: string }) => {
        const panel = getWebviewPanel(args.uri);
        await panel.webview.postMessage({ type: 'getNotebookInfo' });
        return await waitForResponse(panel, 'notebookInfoResponse');
      }
    )
  );
}

// Call in activate()
export function activate(context: vscode.ExtensionContext) {
  registerVSCodeTools(context);
  registerInternalCommands(context);  // Add this
  // ... rest of activation
}
```

### Step 4: Update Webview Message Handlers

Your webview needs to handle the new message format:

```typescript
// In your webview code (e.g., webview/index.tsx)
window.addEventListener('message', async (event) => {
  const message = event.data;

  switch (message.type) {
    case 'insertCell': {
      const { cellType, cellSource, cellIndex } = message;

      // Your existing notebook manipulation logic
      await notebook.insertCell(cellIndex, {
        type: cellType,
        source: cellSource,
        outputs: [],
        metadata: {}
      });

      // Send response back
      vscode.postMessage({
        type: 'insertCellResponse',
        success: true,
        index: cellIndex
      });
      break;
    }

    case 'readCell': {
      const cell = await notebook.getCell(message.cellIndex);

      vscode.postMessage({
        type: 'readCellResponse',
        cell: {
          type: cell.type,
          source: cell.source,
          outputs: cell.outputs,
          metadata: cell.metadata
        }
      });
      break;
    }

    case 'deleteCell': {
      await notebook.deleteCell(message.cellIndex);

      vscode.postMessage({
        type: 'deleteCellResponse',
        success: true
      });
      break;
    }

    // Handle other message types...
  }
});
```

### Step 5: Update package.json

Replace manual tool contributions with generated ones:

```json
{
  "contributes": {
    "languageModelTools": [
      {
        "name": "datalayer_insertCell",
        "displayName": "Insert Notebook Cell",
        "toolReferenceName": "insertCell",
        "modelDescription": "Inserts a code or markdown cell into a Jupyter notebook",
        "canBeReferencedInPrompt": true,
        "inputSchema": {
          "type": "object",
          "properties": {
            "cellType": {
              "type": "string",
              "enum": ["code", "markdown"],
              "description": "Type of cell to insert"
            },
            "cellSource": {
              "type": "string",
              "description": "Content of the cell"
            },
            "cellIndex": {
              "type": "number",
              "description": "Position to insert (0-based, optional)"
            }
          },
          "required": ["cellType", "cellSource"]
        }
      }
      // ... other tools
    ]
  }
}
```

Or generate automatically:

```bash
npm run generate-tools-json
```

### Step 6: Test the Migration

```bash
# 1. Build the extension
npm run compile

# 2. Launch Extension Development Host (F5)

# 3. Test with GitHub Copilot
# In VS Code chat:
@workspace /insertCell Insert a markdown cell with "# Test"

# 4. Verify tool appears in Copilot's tool list
# Should show: datalayer_insertCell, datalayer_deleteCell, etc.
```

### Step 7: Clean Up Old Code

After confirming migration works:

```bash
# Remove old tool implementation files
rm -rf src/tools-old/

# Commit migration
git add .
git commit -m "Migrate to unified tool architecture"
```

---

## Breaking Changes

### 1. Tool Names

**Old**: Inconsistent naming (some with prefix, some without)
**New**: All tools use `datalayer_` prefix

```typescript
// OLD
'insertCell'
'datalayer_createNotebook'

// NEW
'datalayer_insertCell'
'datalayer_createNotebook'
```

**Migration**: Update any hardcoded tool references.

### 2. Parameter Names

**Old**: Varied parameter names across tools
**New**: Consistent, camelCase parameter names

```typescript
// OLD
{ cell_type: 'code', cell_source: '...' }

// NEW
{ cellType: 'code', cellSource: '...' }
```

**Migration**: Tool definitions use JSON Schema, which maps to the correct format.

### 3. Result Format

**Old**: VS Code `LanguageModelToolResult`
**New**: Plain objects (adapter converts to `LanguageModelToolResult`)

```typescript
// OLD
return new vscode.LanguageModelToolResult([
  new vscode.LanguageModelTextPart('✅ Success')
]);

// NEW
return {
  success: true,
  message: '✅ Success'
};
```

**Migration**: No action needed—adapter handles conversion.

### 4. Message Passing

**Old**: Direct function calls
**New**: Message-based communication with webview

```typescript
// OLD
await someDirectFunction();

// NEW
await vscode.commands.executeCommand('datalayer.internal.someCommand', args);
```

**Migration**: Implement internal commands (see Step 3).

---

## Migration Checklist

Use this checklist to track your migration progress:

### Pre-Migration
- [ ] Create backup branch (`git checkout -b backup-old-tools`)
- [ ] Document any custom tool modifications
- [ ] Review current tool usage patterns
- [ ] Test all existing tools to establish baseline

### Core Migration
- [ ] Update [extension.ts](../../extension.ts) to use `registerVSCodeTools()`
- [ ] Remove old manual tool registration code
- [ ] Implement internal command handlers
- [ ] Update webview message handlers
- [ ] Update [package.json](../../package.json) tool contributions

### Testing
- [ ] Build extension (`npm run compile`)
- [ ] Test in Extension Development Host (F5)
- [ ] Verify each tool with GitHub Copilot
- [ ] Test tool confirmation messages
- [ ] Test tool error handling
- [ ] Test tool with invalid parameters

### Validation
- [ ] All 17 tools registered successfully
- [ ] No console errors in Extension Host
- [ ] Copilot can discover all tools
- [ ] Tool execution works as expected
- [ ] Confirmation messages display correctly

### Cleanup
- [ ] Remove old tool implementation files
- [ ] Update internal documentation
- [ ] Remove unused dependencies
- [ ] Run linter (`npm run lint`)
- [ ] Run type checker (`npx tsc --noEmit`)

### Documentation
- [ ] Update README if necessary
- [ ] Document any custom modifications
- [ ] Add migration notes to CHANGELOG
- [ ] Update developer onboarding docs

### Finalization
- [ ] Commit changes (`git commit -m "Migrate to unified tool architecture"`)
- [ ] Create PR for review
- [ ] Deploy to testing environment
- [ ] Get stakeholder approval

---

## Rollback Instructions

If migration fails, you can rollback:

### Option 1: Git Revert (Recommended)

```bash
# Revert to backup branch
git checkout backup-old-tools

# Or cherry-pick old implementation
git checkout main
git checkout backup-old-tools -- src/extension.ts
git commit -m "Rollback: Restore old tool implementation"
```

### Option 2: Manual Restore

1. Restore old [extension.ts](../../extension.ts):
   ```bash
   git show backup-old-tools:src/extension.ts > src/extension.ts
   ```

2. Restore old [package.json](../../package.json) contributions:
   ```bash
   git show backup-old-tools:package.json > package.json
   ```

3. Rebuild:
   ```bash
   npm run compile
   ```

### Option 3: Hybrid Approach

Keep new architecture but revert specific tools:

```typescript
// Use new architecture for most tools
registerVSCodeTools(context);

// But manually override specific problematic tools
context.subscriptions.push(
  vscode.lm.registerTool('datalayer_problematicTool', {
    // Old implementation
  })
);
```

---

## Troubleshooting

### Issue: "No tools registered"

**Cause**: `registerVSCodeTools()` not called or operations not found.

**Solution**:
```typescript
// Check console for warnings
console.log('[Datalayer Tools] Registering tools...');
registerVSCodeTools(context);

// Should see:
// [Datalayer Tools] ✓ Registered datalayer_insertCell → insertCell
// [Datalayer Tools] ✓ Registered datalayer_deleteCell → deleteCell
// ...
```

### Issue: "Tool execution fails"

**Cause**: Internal command not implemented or webview not responding.

**Solution**:
1. Check internal command exists:
   ```typescript
   vscode.commands.getCommands().then(commands => {
     console.log(commands.filter(c => c.startsWith('datalayer.internal.')));
   });
   ```

2. Verify webview message handler:
   ```typescript
   // In webview code
   window.addEventListener('message', (event) => {
     console.log('Received message:', event.data.type);
     // Should log message types
   });
   ```

### Issue: "Parameter validation fails"

**Cause**: Parameter names changed from snake_case to camelCase.

**Solution**: Tool definitions handle this automatically. Verify definition:
```typescript
// Should use camelCase
parameters: {
  properties: {
    cellType: { ... },  // NOT cell_type
    cellSource: { ... }  // NOT cell_source
  }
}
```

### Issue: "Confirmation messages not showing"

**Cause**: Platform config missing.

**Solution**: Add to tool definition:
```typescript
platformConfig: {
  vscode: {
    confirmationMessage: 'Your message here',
    invocationMessage: 'Executing...'
  }
}
```

---

## Need Help?

- 📖 [Architecture Overview](./README.md)
- 🔧 [VS Code Integration Guide](./adapters/vscode/INTEGRATION_GUIDE.md)
- 📝 [Usage Examples](./USAGE_EXAMPLES.md)
- 🧪 [Testing Guide](./core/__tests__/README.md)

---

## Migration Timeline

**Estimated Time**: 2-4 hours for full migration

- **30 min**: Backup and preparation
- **60 min**: Update extension.ts and implement internal commands
- **30 min**: Update webview message handlers
- **30 min**: Testing in Extension Development Host
- **30 min**: Documentation and cleanup

**Recommended Approach**: Migrate incrementally
1. Start with read-only tools (readCell, readAllCells)
2. Then mutation tools (insertCell, deleteCell, updateCell)
3. Finally complex tools (createNotebook, startRuntime)

This allows you to validate the architecture before migrating all tools.
