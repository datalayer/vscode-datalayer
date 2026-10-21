# src/services/apps/ - Running `loop` from the extension host

The I/O behind _Try it here_ (VS-11): how `loop apps run --web` is spawned and which port it is given. No `vscode` import — the commands own the editor's widgets.

## Files

- **loopProcess.ts** - `freePort` (a loopback port picked by the OS) and `spawnLoop` (a `loop` child process read line by line, stopped on demand). Where `loop` is is `services/localRuntime/localRuntimeService.ts`'s `detect` (VS-02).
