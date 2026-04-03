# src/services/core/ - Core Infrastructure Services

Foundational services for authentication, platform integration, dependency injection, and error handling. These are the first services initialized during extension activation.

## Files

- **serviceContainer.ts** - Dependency injection container (`ServiceContainer` class) managing all services with proper initialization order and lifecycle. Lazily creates services on first access using double-check initialization:
  - **Eager init (during `initialize()`)**: LoggerManager (first, enables logging), Datalayer client, AuthProvider (tries keyring -> old secrets -> unauthenticated)
  - **Lazy init (on first access)**: DocumentRegistry, DocumentBridge, KernelBridge, NotebookNetworkService, ErrorHandler
  - Accepts `vscode.ExtensionContext` for access to storage and subscriptions. Disposal happens in reverse initialization order.

- **authProvider.ts** - Datalayer authentication provider (`DatalayerAuthProvider` class, extends `BaseService`, implements `IAuthProvider`). Manages `VSCodeAuthState` containing `isAuthenticated`, `user` (UserDTO), and `error` fields. Fires `onAuthStateChanged` event on any state change. Key methods:
  - `login()` - Shows auth method picker (email/password or OAuth via GitHub/LinkedIn)
  - `loginWithCredentials(email, password)` - Direct credentials login via DatalayerClient
  - `loginWithOAuth(provider)` - Opens system browser for OAuth flow via `OAuthFlowManager`
  - `logout()` - Clears server session and OS keyring storage
  - On initialization, attempts session restoration from OS keyring, falls back to migrating old VS Code secrets.
  - **Critical**: After login, must call `datalayer.setToken(token)` on the base client for API calls to work.

- **authManager.ts** - Synchronizes authentication state with VS Code UI components. Listens to `onAuthStateChanged` events and refreshes spaces tree, runtimes tree, and status bar. Coordinates the visual feedback loop when auth state changes.

- **oauthFlowManager.ts** - Handles OAuth authentication flows for VS Code. Opens the system browser with the OAuth URL and registers a URI handler (`vscode://datalayer.datalayer-jupyter-vscode/auth/callback`) to receive the callback. Extracts the auth token from the callback URL.

- **datalayerAdapter.ts** - VS Code adapter for Datalayer platform integration. Creates `DatalayerClient` instances configured with VS Code settings (`datalayer.services.iamUrl`, etc.) and provides the factory function used by `ServiceContainer`. Configures handlers for VS Code-specific behavior (error dialogs, login prompts).

- **baseService.ts** - Abstract base class providing lifecycle management for all services. Tracks initialization state, provides logging access, and standardizes the `initialize()`/`dispose()` pattern. All services in the container extend this class.

- **errorHandler.ts** - Centralized error handler (`ErrorHandler` class) providing consistent error handling, logging, and user notifications. Categorizes errors by severity and shows appropriate VS Code notification (info, warning, error). Includes `handleWithFallback()` for graceful degradation.
