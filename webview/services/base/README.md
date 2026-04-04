# webview/services/base/ - Base Manager Classes

Abstract base classes implementing the Template Method pattern for kernel and session managers. These eliminate ~200+ lines of duplicate code across mock, local, remote, and pyodide implementations.

## Files

- **baseKernelManager.ts** - Abstract base implementing `Kernel.IManager` interface. Provides common methods (`shutdown()`, `dispose()`, `running()`, `requestRunning()`, `refreshRunning()`, `findById()`) and leaves `startNew()` abstract for subclasses. Includes type discriminator (`managerType: "mock" | "pyodide" | "local" | "remote"`), signal management, and unified logging.
- **baseSessionManager.ts** - Abstract base implementing `Session.IManager` interface. Provides common session lifecycle methods and leaves `startNew()` abstract. Mirrors BaseKernelManager's pattern for notebook-to-kernel binding across execution environments.
- **index.ts** - Export barrel for base classes.
