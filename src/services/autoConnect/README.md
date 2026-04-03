# src/services/autoConnect/ - Automatic Runtime Connection

Strategy pattern implementation for automatically connecting notebooks and lexical documents to runtimes when opened.

## Files

- **autoConnectService.ts** - Main service implementing strategy pattern. Tries multiple strategies sequentially until one succeeds, based on the `datalayer.autoConnect.strategies` configuration setting.

## Subdirectories

- **strategies/** - Individual auto-connect strategy implementations
