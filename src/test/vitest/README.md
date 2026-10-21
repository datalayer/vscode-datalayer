# src/test/vitest/ - Pure-module tests

Vitest tests of the extension's pure modules — `src/chat/*.ts` and `src/services/localRuntime/*.ts`, which import no `vscode` and no React — run under node by the `pure` project of `vitest.config.ts`. They are the local check on a developer's machine, one file at a time (`npx vitest run src/test/vitest/<name>.test.ts`); CI runs them all with the webview project (`npx vitest run`). The extension-host suite beside them (`src/test/**/*.test.ts` under mocha) is CI's only.

## Files

- **startHere.test.ts** - _Start a coding agent here_ (VS-06): the folder's own instructions files kept and said, the conflict with the harness's own file refused, the harness and application picks, the blank harness application, the configure and start requests, the session uid from the stream, the runtime's refusal in a sentence, the request that opens the session in the chat with the host terms from the file.
- **apps.test.ts** - _Try it here_ (VS-11): what a file is (an Appspec, an `app.py`, neither — refused), the command built for it, the served address and the refusal read from `loop`'s lines, the Studio's Validate and Ship tabs, the push line, the panel's page.
