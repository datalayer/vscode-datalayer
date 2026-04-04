# src/utils/ - Shared Utilities

General-purpose utility functions used across the extension.

## Files

- **dispose.ts** - `disposeAll()` function and abstract `Disposable` class for managing resource cleanup implementing the disposable pattern consistently.
- **webviewSecurity.ts** - `getNonce()` generating cryptographically random 32-character strings for Content Security Policy nonce attributes in webviews.
- **webviewCollection.ts** - `WebviewCollection` tracking all webviews associated with documents with automatic cleanup on disposal.
- **activeDocument.ts** - `getActiveDocumentInfo()` and `getActiveCustomEditorUri()` to detect which Datalayer editor (notebook/lexical) is currently active.
- **documentUtils.ts** - `detectDocumentType()` for consistent document type detection (notebook/lexical/cell) across the extension.
- **documentAnalysis.ts** - `analyzeOpenDocuments()` categorizing all open documents as native notebooks, local Datalayer, or cloud Datalayer with majority type detection.
- **getAllOpenedDocuments.ts** - `getAllOpenedDocuments()` returning complete context of all opened documents with type/editor classification.
- **notebookValidation.ts** - `isDatalayerNotebook()`, `getActiveDatalayerNotebook()`, and `validateDatalayerNotebook()` ensuring tools only operate on Datalayer custom editor notebooks.
- **runtimeNameGenerator.ts** - Generates unique, human-readable runtime names using adjective-animal pattern (e.g., "Brave-Tiger").
- **dateFormatter.ts** - `formatDateForName()` for snapshot naming and `formatRelativeTime()` for human-readable relative time.
