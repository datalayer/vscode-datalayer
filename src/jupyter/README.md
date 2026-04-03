# src/jupyter/ - Jupyter Extension API Integration

Integration with the official VS Code Jupyter extension API.

## Files

- **serverProvider.ts** - Datalayer Jupyter Server Provider implementing the Jupyter Extension API to show active runtimes and "Create GPU/CPU Runtime" commands in the native kernel picker. Architecture based on Colab's implementation.
