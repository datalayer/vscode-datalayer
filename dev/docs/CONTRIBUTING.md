# Contributing to Datalayer VS Code Extension

Thank you for your interest in contributing to the Datalayer VS Code extension! This document outlines the contribution process and quality standards.

## How to Contribute

1. **Fork the Repository**: Create a fork of the repository on GitHub
2. **Create a Branch**: Create a feature branch from `main` for your changes
3. **Make Changes**: Implement your feature or bug fix following our guidelines
4. **Test Thoroughly**: Ensure your changes work correctly in the Extension Development Host
5. **Submit a Pull Request**: Create a PR with a clear description of your changes

## Development Workflow

### Before You Start

1. Review the [DEVELOPMENT.md](./DEVELOPMENT.md) file for setup instructions
2. Ensure you have the required prerequisites installed
3. Run `npm install` to install dependencies
4. Run `npm run watch` to start development mode

### Code Quality Standards

All contributions must meet these quality standards:

#### TypeScript & Linting

```bash
# Check TypeScript compilation
npx tsc --noEmit

# Run ESLint
npm run lint

# Auto-fix linting issues
npm run lint:fix

# Run all quality checks
npm run check
```

#### Type Safety Requirements

All code must:

- Use `unknown` instead of `any` (except with explicit `eslint-disable-next-line`)
- Include proper TypeScript types for all exports
- Pass strict TypeScript compilation
- Have complete JSDoc documentation for public APIs

```typescript
// ❌ Bad - bypasses type checking
function process(data: any) { ... }

// ✅ Good - type-safe
function process(data: unknown) {
  if (typeof data === 'string') {
    // Type narrowed to string
  }
}
```

#### Documentation

- All exported functions, classes, and interfaces must have JSDoc comments
- Use TypeDoc syntax for comprehensive API documentation
- Include usage examples for complex functionality
- Must achieve 100% documentation coverage

#### Code Style

- Use Prettier for code formatting (configured in `.prettierrc.json`)
- Follow existing architectural patterns and naming conventions
- Maintain consistency with the existing codebase
- All test mocks must use proper TypeScript interfaces

## CI/CD & Quality Assurance

The project includes comprehensive GitHub Actions workflows that run on every PR:

### Automated Workflows

#### Extension Build & Test

- **Platforms**: Multi-platform build (Windows, macOS, Linux)
- **Artifacts**: Generates `.vsix` extension packages for all platforms
- **Testing**: Verifies extension packaging and installation

#### Code Quality

- **Linting**: Automated ESLint checks with zero-tolerance for errors
- **Formatting**: Prettier formatting validation
- **Console.log Detection**: Warns about console.log statements in source code
- **Import Ordering**: Validates import statement organization

#### Type Check

- **TypeScript Compilation**: Verifies code compiles without errors
- **Strict Mode**: Checks compatibility with strict TypeScript settings
- **Declaration Files**: Tests TypeScript declaration generation
- **Type Coverage**: Analyzes type safety coverage

### Quality Gates

All PRs must pass these automated checks:

- ✅ TypeScript compilation without errors
- ✅ ESLint rules with zero warnings
- ✅ Prettier formatting compliance
- ✅ All 41 tests passing
- ✅ 100% documentation coverage
- ✅ Extension builds successfully on all platforms
- ✅ No console.log statements in production code
- ✅ No `any` types without explicit justification

## Architecture Overview

The extension consists of two main parts:

- **Extension Context** (`src/`): Node.js environment, handles authentication & server communication
- **Webview** (`webview/`): React-based notebook editor with VS Code theme integration
- **Message Passing**: JWT token injection between extension and webview

### Communication Flow

The editor is encapsulated within an iframe. All communications between the editor and external services involve posting messages between the extension and webview:

1. **Jupyter Service Interaction**: The webview creates a JupyterLab `ServiceManager` with mocked `fetch` and `WebSocket`
2. **Message Serialization**: Requests are serialized and posted to the extension
3. **Extension Processing**: The extension deserializes and makes actual network requests
4. **Response Handling**: Responses are serialized and posted back to the webview

## Getting Help

### Resources

- **Development Guide**: [DEVELOPMENT.md](./DEVELOPMENT.md)
- **Release Process**: [RELEASE.md](./RELEASE.md)
- **API Documentation**: [https://vscode-datalayer.netlify.app](https://vscode-datalayer.netlify.app)

### Communication

- **Issues**: Use GitHub issues for bug reports and feature requests
- **Discussions**: Use GitHub discussions for questions and ideas
- **Support**: For general support, visit our [GitHub repository](https://github.com/datalayer/vscode-datalayer)

## Code of Conduct

We are committed to providing a welcoming and inclusive environment for all contributors. Please:

- Be respectful and constructive in all interactions
- Focus on what is best for the community
- Show empathy towards other community members
- Provide helpful and actionable feedback

Thank you for contributing to the Datalayer VS Code extension!
