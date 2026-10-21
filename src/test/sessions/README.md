# src/test/sessions/ - Sessions in the editor, in the extension host

Mocha tests run by `vscode-test` in the Extension Development Host (CI only: the compile runs out of memory on a developer's machine), with the fixture workspace (`src/test/fixtures`) open and the stub `loop` (`src/test/fixtures/stub-loop`) as the local runtime through `datalayer.local.loopPath`.

## Files

- **startHere.test.ts** - _Start a coding agent here_ (VS-06): the commands are registered; a harness whose own instructions file the folder holds (Claude Code, the fixture's `CLAUDE.md`) is refused in the sentence; another is started — the application configured on the stub runtime, the session opened and listed under `/api/v1/apps/sessions`, the request handed to the chat at the local place with the file's host terms.
