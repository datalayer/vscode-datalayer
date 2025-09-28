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

- Initial release
