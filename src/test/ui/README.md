# src/test/ui/ - UI Template and Style Tests

Tests for HTML template generators and CSS theme utilities.

## Files

- **notebookTemplate.test.ts** - Tests notebook webview HTML generation including CSP nonces, script URIs, Pyodide configuration, and cache busting.
- **datasourceTemplate.test.ts** - Tests datasource creation dialog HTML generation including CSP, Primer theme CSS injection, and script references.
- **datasourceEditTemplate.test.ts** - Tests datasource edit dialog HTML generation with separate title and script bundle from create dialog.
- **primerVSCodeTheme.test.ts** - Tests Primer-to-VS-Code CSS variable mapping including base colors, button variants, form controls, border radius, and component overrides.
