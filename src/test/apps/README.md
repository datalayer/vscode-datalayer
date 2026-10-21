# src/test/apps/ - The Studio's journey from the editor, in the extension host

Mocha tests run by `vscode-test` in the Extension Development Host (CI only), with the fixture workspace open and the stub `loop` as `datalayer.local.loopPath`.

## Files

- **tryHere.test.ts** - _Try this application_ (VS-11): a file that is not an application is refused in the sentence; the fixture Appspec is served by the stub `loop apps run --web --watch` and the command answers the page's address, which answers; the same file asked again reuses its preview.
