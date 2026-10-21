/*
 * Copyright (c) 2021-2025 Datalayer, Inc.
 *
 * MIT License
 */

/**
 * The jupyter-react tools entry, as the extension imports it
 * (`src/tools/definitions/index.ts`, `src/tools/core/registration.ts`,
 * `src/tools/operations/executeCode.ts`): `@datalayer/jupyter-react/tools`
 * is an `exports` subpath, which the project's `moduleResolution: node` does
 * not read. Declared as the `require` it replaces read it — untyped; what it
 * exports is checked where it is used.
 */
declare module "@datalayer/jupyter-react/tools";
