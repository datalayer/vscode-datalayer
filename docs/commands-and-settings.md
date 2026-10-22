# Commands and settings

All commands are in the command palette (`Ctrl+Shift+P` / `Cmd+Shift+P`) under **Datalayer**.

## Commands

| Area         | Commands                                                                                                                                                                      |
| ------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Home         | Home                                                                                                                                                                          |
| Account      | Login to Datalayer, Logout, Show Authentication Status                                                                                                                        |
| Sessions     | Refresh and filter sessions, Import a Session…; on a session: Resume, Switch Agent…, Clone from Here…, Export…, Rename…, Archive, End, Reveal in Explorer, Open in the Studio |
| Local agents | Start the Local Runtime, Stop the Local Runtime, Check a Coding Agent on This Machine, Set a Harness Credential, Start a coding agent here                                    |
| Applications | Try this application; open its Validate or Ship tab in the browser                                                                                                            |
| Documents    | New Jupyter Notebook, New Datalayer Document (local or in a space); on a space's file: Open, Rename, Delete                                                                   |
| Runtimes     | Select or switch runtime, Terminate runtimes, View runtime controllers status                                                                                                 |

## Settings

Open the settings (`Ctrl+,` / `Cmd+,`) and search for **Datalayer**.

**Agents**

- `datalayer.agentChat.enabled`: list your applications in the Datalayer Chat (default: on).

**Local runtime**

- `datalayer.local.enabled`: start a local runtime (`loop serve`) in a workspace folder when a session asks for it (default: on).
- `datalayer.local.loopPath`: where `loop` is; empty looks on PATH, then under uv tool's and pipx's bins.

**Runtimes**

- `datalayer.runtime.defaultMinutes`: a new runtime's duration (default: 10, at most 1,440).
- `datalayer.autoConnect.strategies`: what a document does when it opens (default: `["Active Runtime", "Ask"]`).
  - `["Active Runtime"]`: connect to the runtime with the most time left.
  - `["Active Runtime", "Ask"]`: that, or ask when there is none.
  - `["Ask"]`: always ask.
  - `[]`: never connect by itself.

**Service URLs**

- `datalayer.services.iamUrl`, `datalayer.services.runtimesUrl`, `datalayer.services.spacerUrl`, `datalayer.services.spacerWsUrl`.

**Logging**

- `datalayer.logging.level`: trace, debug, info, warn or error (default: info).
- `datalayer.logging.includeTimestamps` (default: on), `datalayer.logging.enableDatalayerLogging` (API calls, default: on), `datalayer.logging.enablePerformanceMonitoring` (default: off).
