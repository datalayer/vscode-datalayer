# Change Log

All notable changes to the Datalayer VS Code extension are documented here.

## [Unreleased]

### Fixed (January 2025)

- **Runtime Tree View Refresh**: Tree view now properly refreshes after "terminate all runtimes" command
  - Added 500ms delay before refresh to allow server-side processing
  - Affects both single runtime termination and bulk termination
  - Files: `src/commands/runtimes.ts:601, 686`

### Changed (January 2025)

- **BREAKING: Lexical File Extension**: Changed from `.lexical` to `.dlex` ([#133](https://github.com/datalayer/vscode-datalayer/issues/133))
  - Existing `.lexical` files will continue to work (backward compatible)
  - New lexical documents created with `.dlex` extension
  - UI and documentation updated to reflect new extension
  - Shorter, clearer brand association ("Datalayer Lexical")

- **Smart Controller**: Disabled `SmartDynamicControllerManager` for native notebook integration
  - Needs improvement before re-enabling
  - All code handles null controller safely with optional chaining
  - File: `src/services/ui/uiSetup.ts:85`

## [0.0.3] - 2025-01-XX

### Major Features

#### Two Custom Editors

- **Jupyter Notebooks** (`.ipynb`): Full notebook editing with cloud runtime execution
- **Lexical Documents** (`.dlex`): Rich text editing with formatting support

#### Two Tree Views

- **Datalayer Spaces**: Browse and manage cloud documents (notebooks and lexical docs)
  - Create, rename, delete documents
  - Hierarchical space display with default space indicator
  - Context menu actions
  - Virtual file system (`datalayer://` URIs)
- **Datalayer Runtimes**: Manage cloud computational environments
  - Create new runtimes with environment selection
  - Terminate single or all runtimes
  - Monitor runtime status and details
  - Create snapshots (UI ready, implementation pending)

#### Runtime Management

- Automatic runtime creation and reuse
- Health verification before reuse
- Dynamic environment loading from API with caching (`EnvironmentCache`)
- Credits calculation based on duration and environment burning rate
- Default runtime duration configurable (1-1440 minutes)

#### Authentication System

- Token-based login with Datalayer platform
- GitHub profile enrichment for OAuth users
- Secure storage via VS Code SecretStorage API
- Status bar integration showing connection state
- Auth state synchronization across components

#### Logging Infrastructure

- Three-tier logging system (LoggerManager → ServiceLoggers → Individual Loggers)
- Configurable log levels: trace, debug, info, warn, error
- Optional timestamps and context information
- SDK logging integration via adapter
- Performance monitoring (optional)

### Added - Test Infrastructure & Type Safety

- Complete type safety for test infrastructure with strongly-typed interfaces
- `MockSDK` interface with 24+ typed spy methods for SDK mocking
- `MockSpyFunction` interface for type-safe spy functions with call tracking
- `MockLogger` interface extending `ILogger` for type-safe logger mocks
- `createMockLogger()` factory function returning properly typed ILogger instances
- Comprehensive test helpers for async operations, error handling, and event capture
- Type-safe mock factories for VS Code APIs (ExtensionContext, OutputChannel, StatusBarItem)

### Fixed - Code Quality

- 77 ESLint `@typescript-eslint/no-explicit-any` warnings by replacing `any` with `unknown` types
- 67 TypeScript type-check errors in test files through proper type assertions
- All test mock types now properly extend VS Code and SDK interfaces
- Type safety in test helpers with proper error handling (`instanceof Error` checks)
- Mock spy function return type binding for proper type inference

### Testing

- ✅ All 41 tests passing (100% success rate)
- ✅ Zero TypeScript type-check errors
- ✅ Zero ESLint warnings
- ✅ Zero TypeDoc documentation errors
- ✅ 100% documentation coverage maintained (466/466 items)

### Technical Improvements

- Replaced all `as any` type assertions with safer `unknown` types in test code
- Used targeted `eslint-disable-next-line` only for intentional singleton/private member access
- Improved type narrowing with proper guards and assertions
- Enhanced test infrastructure maintainability with strong typing

- Initial release
