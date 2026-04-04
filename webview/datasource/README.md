# webview/datasource/ - Datasource Dialog Webviews

Standalone webview applications for creating and editing datasources. Each dialog is a separate webpack entry point that runs in its own webview panel.

## Files

- **DatasourceDialog.tsx** - Form dialog for creating new datasources. Provides type selection (Amazon Athena, BigQuery, Microsoft Sentinel, Splunk), field validation, and sends creation data back to the extension via postMessage.
- **DatasourceEditDialog.tsx** - Dialog for editing existing datasources with name/description updates and secret field visibility toggles. Receives existing datasource data from the extension on load.
- **main.tsx** - Entry point for the Create Datasource webview. Handles theme change messages from the extension and renders the DatasourceDialog component.
- **editMain.tsx** - Entry point for the Edit Datasource webview. Handles theme changes and renders the DatasourceEditDialog component.
