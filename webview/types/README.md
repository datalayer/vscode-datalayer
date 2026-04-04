# webview/types/ - Webview Type Definitions

Type-safe message protocol definitions for extension-webview communication.

## Files

- **messages.ts** - Discriminated union types for the message protocol between extension and webview. Defines all message types with compile-time type safety, ensuring both sides agree on message shapes. Used by `messageHandler.ts` for type-safe postMessage communication.
