# src/services/config/ - Settings Validation

Centralized Zod-based validation for Datalayer VS Code extension settings.

## Files

- **settingsValidator.ts** - Zod schemas for every `datalayer.*` settings group defined in `package.json`. Provides `getValidatedSettings()` to read all settings at once and `getValidatedSettingsGroup()` for a single group. Invalid values fall back to safe defaults and log warnings via `ServiceLoggers`.
