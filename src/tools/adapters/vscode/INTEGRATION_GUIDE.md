# VS Code Integration Guide

## How to Integrate the Unified Tool Architecture

### Step 1: Update `extension.ts`

Replace the old manual tool registration with the new factory registration:

```typescript
// extension.ts

// OLD CODE (Delete this):
/*
import { InsertDatalayerCellTool } from "./tools/insertDatalayerCell";
import { DeleteDatalayerCellTool } from "./tools/deleteDatalayerCell";
// ... 15 more imports

export function activate(context: vscode.ExtensionContext) {
  // ... existing setup code ...

  // Register tools manually (OLD WAY)
  context.subscriptions.push(
    vscode.lm.registerTool("datalayer_insertCell", new InsertDatalayerCellTool()),
    vscode.lm.registerTool("datalayer_deleteCell", new DeleteDatalayerCellTool()),
    // ... 15 more manual registrations
  );
}
*/

// NEW CODE (Add this):
import { registerVSCodeTools } from "./tools/adapters/vscode";

export function activate(context: vscode.ExtensionContext) {
  // ... existing setup code (keep as-is) ...

  // Register all tools automatically (NEW WAY)
  registerVSCodeTools(context);

  // That's it! All 17+ tools are now registered from definitions
}
```

### Step 2: Remove Old Tool Files (Optional - for cleanup)

After verifying zero regressions, you can delete the old tool implementation files:

```bash
# Backup first!
mkdir -p old-tools-backup
mv src/tools/insertDatalayerCell.ts old-tools-backup/
mv src/tools/deleteDatalayerCell.ts old-tools-backup/
# ... move all old tool files
```

### Step 3: Verify No Regressions

```typescript
// Create a test file: src/tools/adapters/vscode/__tests__/integration.test.ts

import { describe, it, expect, beforeEach } from "vitest";
import * as vscode from "vscode";
import { registerVSCodeTools } from "../registration";

describe("VS Code Tool Registration", () => {
  it("should register all tools without errors", () => {
    const mockContext = {
      subscriptions: [],
    } as any;

    expect(() => registerVSCodeTools(mockContext)).not.toThrow();
    expect(mockContext.subscriptions.length).toBeGreaterThan(0);
  });

  it("should register tools with correct names", () => {
    const mockContext = { subscriptions: [] } as any;
    registerVSCodeTools(mockContext);

    // Verify expected tool names were registered
    // This would require mocking vscode.lm.registerTool
  });
});
```

## Benefits of the New Architecture

### Before (Old Way)

- ❌ 17+ separate TypeScript files
- ❌ Manual registration in extension.ts
- ❌ Duplication between package.json and TypeScript
- ❌ Platform-specific logic mixed with business logic
- ❌ Hard to test (requires VS Code APIs)

### After (New Way)

- ✅ Single line registration: `registerVSCodeTools(context)`
- ✅ Business logic in platform-agnostic operations
- ✅ Tool definitions auto-generate package.json
- ✅ Easy to test (mock DocumentHandle)
- ✅ Same code works in SaaS and ag-ui

## Migration Checklist

- [ ] Add `import { registerVSCodeTools } from "./tools/adapters/vscode"`
- [ ] Replace manual tool registrations with `registerVSCodeTools(context)`
- [ ] Test all tools work correctly in Extension Host (F5)
- [ ] Test with GitHub Copilot
- [ ] Verify zero regressions
- [ ] (Optional) Remove old tool implementation files
- [ ] (Optional) Update package.json with generated contributions

## Troubleshooting

### Tools not showing up in Copilot

1. Check console for registration errors:

   ```
   [Datalayer Tools] Registering 9 tools with unified architecture
   [Datalayer Tools] ✓ Registered datalayer_insertCell → insertCell
   ```

2. Verify `allToolDefinitions` includes your tools:

   ```typescript
   import { allToolDefinitions } from "./tools/definitions/tools";
   console.log(allToolDefinitions.map((t) => t.name));
   ```

3. Check operation is registered:
   ```typescript
   import { allOperations } from "./tools/core/operations";
   console.log(Object.keys(allOperations));
   ```

### "No active Datalayer notebook found" error

This means the tool tried to operate on a notebook but couldn't find one.

**Solution**: Ensure a Datalayer notebook (`.ipynb` with Datalayer custom editor) is open and active.

### Operation execution errors

Check the execution context is properly built:

```typescript
// In VSCodeToolAdapter.ts, add logging:
private async buildExecutionContext(params: TParams) {
  const context = await super.buildExecutionContext(params);
  console.log("[Context]", {
    hasDocument: !!context.document,
    hasSDK: !!context.sdk,
    hasAuth: !!context.auth,
  });
  return context;
}
```

## Testing

```bash
# Run unit tests
npm test src/tools/core/__tests__
npm test src/tools/adapters/vscode/__tests__

# Test in Extension Host
# 1. Press F5 to launch Extension Development Host
# 2. Open a Datalayer notebook
# 3. Ask Copilot to insert a cell
# 4. Verify it works as expected
```

## Next Steps

After VS Code integration is stable:

- Add remaining tool definitions (7 more tools to reach 17 total)
- Generate package.json contributions automatically
- Implement SaaS adapter (Phase 4)
- Implement ag-ui adapter (Phase 5)
