# Change Log

All notable changes to the "datalayer-notebook" extension will be documented in this file.

Check [Keep a Changelog](http://keepachangelog.com/) for recommendations on how to structure this file.

## [Unreleased]

### Added

- Unified kernel selection interface with support for multiple kernel sources
- Kernel Bridge architecture for routing connections to webview or native notebooks
- MutableServiceManager to prevent notebook re-renders when switching runtimes
- Display "Datalayer: {Runtime name}" in notebook toolbar for better runtime identification
- Support for connecting to existing Jupyter servers via kernel selector

### Fixed

- "No webview found" error when selecting runtime from picker
- Notebook re-rendering issue when changing runtimes
- Proper webview registration and lookup in KernelBridge

### Changed

- Kernel selector now shows three options: Datalayer Platform, Python Environments (coming soon), and Existing Jupyter Server
- Improved runtime switching without component unmount/remount

## [0.0.3] - 2025-01-XX

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
