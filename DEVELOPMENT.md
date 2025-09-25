# Development Guide

This document provides comprehensive information for developers who want to contribute to or modify the Datalayer VS Code extension.

## Prerequisites

- Node.js >= 20.0.0 and < 21.0.0 (use `.nvmrc` for version management)
- VS Code >= 1.98.0
- npm (not yarn)

**Important**: The extension runs in VS Code's Node.js 20 runtime. Using Node.js 20 for development ensures compatibility.

## Setup

```bash
# Install dependencies
npm install

# Watch for changes (development)
npm run watch

# Run linting
npm run lint

# Build extension
npm run compile

# Package extension
npm run package

# Create VSIX package
npm run vsix
```

## Testing

```bash
# Run tests
npm test

# Compile tests
npm run compile-tests

# Watch tests
npm run watch-tests
```

## Debugging

1. Open the project in VS Code
2. Run `npm run watch` in terminal
3. Press `F5` to launch Extension Development Host
4. Open any `.ipynb` file to test the extension

## Architecture Overview

The extension consists of two main parts:

- **Extension Context** (`src/`): Node.js environment, handles authentication & server communication
- **Webview** (`webview/`): React-based notebook editor with VS Code theme integration
- **Message Passing**: JWT token injection between extension and webview

### Key Components

- **Authentication System**: Token-based login with Datalayer platform
- **Spaces Tree View**: Hierarchical display of Datalayer spaces and documents
- **Lexical Editor**: Rich text editing for `.lexical` documents
- **Runtime Management**: Automatic runtime creation and reuse
- **VS Code Theme Integration**: Complete theme matching with syntax highlighting

## Documentation

### Generate Documentation

The codebase uses TypeDoc for comprehensive API documentation:

```bash
# Generate HTML documentation
npm run doc

# Generate markdown documentation
npm run doc:markdown

# Watch mode for development (rebuilds on file changes)
npm run doc:watch

# Check documentation coverage
npm run doc:coverage
```

### Output Directories

- `docs/` - HTML documentation (TypeDoc default theme)
- `docs-markdown/` - Markdown documentation for integration with other systems

### Online Documentation

**Live Documentation**: [https://datalayer-desktop.netlify.app](https://datalayer-desktop.netlify.app)

The documentation is automatically built and deployed on every push to the main branch using Netlify. It includes:

- **API Reference**: Complete TypeScript API documentation
- **Module Documentation**: Detailed module and namespace documentation
- **Interface Documentation**: All TypeScript interfaces and types
- **Code Examples**: Usage examples and code snippets
- **Coverage Reports**: Documentation coverage metrics

### Automated Documentation Builds

The documentation system includes:

- **Automatic Deployment**: Every push to `main` triggers a new documentation build
- **Multi-format Output**: Generates both HTML and Markdown formats
- **Coverage Tracking**: Monitors documentation completeness
- **Performance Optimization**: CSS/JS minification and bundling via Netlify
- **SEO Optimization**: Proper meta tags, sitemap generation, and clean URLs

## Code Quality

The project uses several tools to maintain code quality:

- **TypeScript**: Strong typing and compile-time checks
- **ESLint**: Code linting and style enforcement
- **Prettier**: Automated code formatting
- **TypeDoc**: Documentation generation and coverage

All code should include proper JSDoc comments for TypeScript interfaces, classes, and exported functions.

## Project Structure

```
src/
├── auth/           # Authentication services
├── spaces/         # Spaces tree view & API
├── editors/        # Custom editors (notebook, lexical)
└── runtimes/       # Runtime management

webview/
├── theme/          # VS Code theme integration
├── NotebookVSCode.tsx    # Main notebook component
├── NotebookToolbar.tsx   # VS Code-style toolbar
└── LexicalEditor.tsx     # Rich text editor
```

## Configuration

Extension settings can be configured in VS Code:

- `datalayer.serverUrl` - Datalayer server URL (default: https://prod1.datalayer.run)
- `datalayer.runtime.environment` - Default runtime environment for notebooks (`python-cpu-env` or `ai-env`, default: `python-cpu-env`)
- `datalayer.runtime.creditsLimit` - Default credits limit for new runtimes (minimum: 1, default: 10)

## Known Technical Limitations

- **Websocket binary support**: The extension currently forbids the usage of the newer protocol v1.kernel.websocket.jupyter.org due to serialization issues between the webview and extension.

## Development Best Practices

- Always check TypeScript compilation with `npx tsc --noEmit` before committing
- Run linting with `npm run lint` to ensure code quality
- Include comprehensive JSDoc documentation for all exported functions
- Test extension functionality in the Extension Development Host before submitting PRs
- Follow existing code patterns and architectural decisions