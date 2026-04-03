# src/tools/schemas/ - Parameter Validation Schemas

Zod validation schemas for tool parameters ensuring type safety and input validation.

## Files

- **index.ts** - Central export hub for all tool parameter schemas organized by feature.
- **getActiveDocument.ts** - Empty Zod schema for getActiveDocument (no parameters).
- **createNotebook.ts** - Schema for notebook creation: name, description, space, location, initial cells.
- **createLexical.ts** - Schema for lexical document creation matching notebook structure for consistency.
- **createDocument.ts** - Unified schema for generic document creation supporting both notebook and lexical types.
- **selectKernel.ts** - Schema for kernel selection: kernelId, autoStart, environmentType, durationMinutes with natural language mapping.
- **listKernels.ts** - Schema for kernel listing: includeLocal, includeCloud, and optional filter.
- **manageRuntime.ts** - Schemas for runtime start (environment, duration) and connect (runtime configuration) parameters.
