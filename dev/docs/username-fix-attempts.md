# Lexical Editor Username Fix - Failed Attempts Log

**Date:** December 22, 2024
**Issue:** Comments showing random animal names instead of Datalayer username
**Current Status:** Editor completely blank - nothing renders (not even toolbar)

---

## Problem Evolution

1. **Initial:** Comments showing random animals ("Hedgehog", "Cat-9752") instead of username
2. **After fixes:** Circular dependency errors
3. **After circular dependency fix:** Editor not opening
4. **Current:** Editor completely blank, content flashes briefly then disappears

---

## Attempted Fixes

### Attempt 1: Circular Dependency Fix

**File:** `src/providers/lexicalProvider.ts`
**Change:** Modified `initializeAuthListener()` to accept `authProvider` as parameter instead of calling `getServiceContainer()`
**File:** `src/services/ui/uiSetup.ts`
**Change:** Pass authProvider directly when calling `initializeAuthListener()`
**Result:** ❌ Error "getServiceContainer is not a function" resolved, but editor doesn't open

### Attempt 2: ProviderFactory Conditional Props

**File:** `webview/lexical/LexicalEditor.tsx`
**Change:** Used conditional prop spreading `{...(collaboration?.enabled ? { providerFactory: createVSCodeLoroProvider } : {})}`
**Result:** ❌ Failed - providerFactory is a REQUIRED prop, not optional

### Attempt 3: No-op Provider Factory

**File:** `webview/lexical/LexicalEditor.tsx`
**Change:** Created no-op function for local files:

```typescript
const providerFactory = collaboration?.enabled
  ? createVSCodeLoroProvider
  : () =>
      ({
        connect: () => {},
        disconnect: () => {},
        on: () => () => {},
        off: () => {},
      }) as any;
```

**Result:** ❌ Editor still blank

### Attempt 4: shouldBootstrap Conditional

**File:** `webview/lexical/LexicalEditor.tsx`
**Change:** Changed `shouldBootstrap` from `true` to `{collaboration?.enabled || false}`
**Result:** ❌ Editor still blank

### Attempt 5: Don't Render LoroCollaborationPlugin for Local Files

**File:** `webview/lexical/LexicalEditor.tsx`
**Change:** Only render `<LoroCollaborationPlugin>` when `collaboration?.enabled` is true:

```typescript
{collaboration?.enabled && (...)}
```

**Result:** ⏳ TESTING - Build completed, needs verification

### Attempt 6: Fix TypeScript Compilation Error ✅

**File:** `src/providers/lexicalProvider.ts:180`
**Problem:** `entry.document` doesn't exist - `entry` type is `{ resource: string; webviewPanel: WebviewPanel }`
**Change:** Get document from `this.documents` Map instead:

```typescript
const document = this.documents.get(uriString);
if (!document) continue;
await collaborationService.setupCollaboration(document);
```

**Result:** ✅ TypeScript errors fixed (0 errors), webpack compiled successfully

---

## Console Errors/Warnings Observed

1. **React Warnings:**
   - "Cannot update a component (`JupyterReactTheme`) while rendering a different component (`LexicalToolbar`)"
   - "Cannot update a component (`JupyterReactTheme`) while rendering a different component (`JupyterContextProvider`)"
   - "flushSync was called from inside a lifecycle method"

2. **User Reports:**
   - "nothing is rendered on the editor.... I see a blank empty page"
   - "no toolbar nothing"
   - "content flash for a moment before disappearing"

---

## Successful Changes (Confirmed Working)

1. ✅ Username extraction logic working (`'Gonzalo Peña-Castellanos (VSCode)'`)
2. ✅ Extension activation successful
3. ✅ No fatal JavaScript errors in console
4. ✅ React component tree rendering (warnings but no crashes)

---

## Root Cause Hypotheses

### Hypothesis 1: LoroCollaborationPlugin Incompatibility

- Plugin may require valid provider even with no-op
- `shouldBootstrap=true` might clear editor state when collaboration disabled
- **Status:** Testing fix (don't render plugin when disabled)

### Hypothesis 2: React State Management Issue

- Components calling setState during render causes re-render loops
- JupyterReactTheme being updated from multiple children
- **Evidence:** Multiple "Cannot update component while rendering" warnings

### Hypothesis 3: CSS/Rendering Issue

- Content rendering but hidden by CSS
- Z-index or visibility issues
- **Evidence:** User reports "content flashes before disappearing"

### Hypothesis 4: Error Boundary Swallowing Errors

- React ErrorBoundary catching errors silently
- No visual error indication
- **Evidence:** Components mount but nothing visible

---

## What We Know Works

1. **Extension Host:** Activates correctly, no errors
2. **Username Extraction:** `'Gonzalo Peña-Castellanos (VSCode)'` extracted correctly
3. **WebSocket URL:** Being sent to webview correctly
4. **Compilation:** No TypeScript or webpack errors (warnings only)
5. **React Mounting:** Component tree renders (LexicalEditor, LoroCollaborationPlugin, etc.)

---

## What's Broken

1. **Visual Output:** Completely blank page
2. **Toolbar:** Not visible
3. **Content:** Not visible (even though it flashes briefly)
4. **Comments:** Can't test because editor doesn't render

---

## Next Steps to Try

1. **Check for Fatal Errors in Latest Build**
   - Last build showed "2 errors and 10 warnings" before success
   - Need to see what those 2 errors were

2. **Add Error Boundary with Visible Error Display**
   - Create error boundary that shows errors instead of blank page
   - Helps debug what's crashing

3. **Remove CommentPlugin Temporarily**
   - Test if CommentPlugin is causing the blank page
   - Process of elimination

4. **Check if Issue Exists Without Loro Imports**
   - Comment out all Loro-related code
   - See if editor renders without collaboration features

5. **Revert to Known Working State**
   - Git checkout to before username fix attempts
   - Confirm editor works without our changes
   - Apply fixes incrementally

---

## Files Modified

1. `/Users/goanpeca/Desktop/develop/datalayer/vscode-datalayer/src/providers/lexicalProvider.ts`
2. `/Users/goanpeca/Desktop/develop/datalayer/vscode-datalayer/src/services/ui/uiSetup.ts`
3. `/Users/goanpeca/Desktop/develop/datalayer/vscode-datalayer/webview/lexical/LexicalEditor.tsx`

---

## Build Commands Used

```bash
# Clean rebuild
rm -rf dist out && npm run compile

# Quick rebuild
npm run compile
```

---

## Key Learnings

1. **Type Definitions Matter:** LoroCollaborationPlugin's type shows `providerFactory` is required, not optional
2. **No-op Functions Don't Always Work:** Even with stub implementations, plugin may expect real provider
3. **React Warnings ≠ Crashes:** Editor can have warnings but still work (or not work for other reasons)
4. **shouldBootstrap Behavior:** Unclear what this does when `true` - may clear state

---

**Last Updated:** 2025-12-22 23:00 UTC
