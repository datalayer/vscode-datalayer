# Release Process

This document outlines the release process and roadmap for the Datalayer VS Code extension.

## Current Version

**Version**: 0.0.2
**VS Code Engine**: ^1.98.0
**Node.js Requirement**: >= 20.0.0 and < 21.0.0

## Release Workflow

### 1. Pre-Release Checklist

Before creating a new release:

- [ ] All tests pass locally and in CI
- [ ] Code quality checks pass (ESLint, TypeScript, Prettier)
- [ ] Documentation is up to date
- [ ] Version number is updated in `package.json`
- [ ] CHANGELOG.md is updated with new features and bug fixes
- [ ] All known issues are documented

### 2. Build Process

```bash
# Install dependencies
npm install

# Run quality checks
npm run lint
npx tsc --noEmit

# Build extension
npm run compile

# Package extension
npm run package

# Create VSIX package
npm run vsix
```

### 3. Testing

Before release, test the extension thoroughly:

- [ ] Install the `.vsix` package in VS Code
- [ ] Test notebook operations (create, edit, execute)
- [ ] Test authentication flow
- [ ] Test spaces tree view functionality
- [ ] Test lexical document editing
- [ ] Test runtime management
- [ ] Verify theme integration works across different VS Code themes

### 4. Publishing

#### Manual Publishing

1. **Build Package**:

   ```bash
   npm run vsix
   ```

2. **Upload to Marketplace**:
   - Go to https://marketplace.visualstudio.com/manage/publishers/datalayer
   - Upload the generated `.vsix` file
   - Add release notes and update information

#### CLI Publishing

```bash
# Install vsce if not already installed
npm install -g @vscode/vsce

# Login to publisher account
vsce login datalayer

# Publish new version
vsce publish
```

### 5. Post-Release

After publishing:

- [ ] Create GitHub release with release notes
- [ ] Update documentation links if needed
- [ ] Announce release on relevant channels
- [ ] Monitor for user feedback and issues

## Version Management

We follow [Semantic Versioning](https://semver.org/):

- **MAJOR** (x.0.0): Breaking changes or major feature additions
- **MINOR** (0.x.0): New features, backward compatible
- **PATCH** (0.0.x): Bug fixes, backward compatible

### Version Update Process

1. Update version in `package.json`
2. Update version references in documentation
3. Create changelog entry
4. Commit changes with descriptive message

## Roadmap & Not Yet Implemented

### High Priority

- [ ] **Save Notebook**: Implement saving notebook files back to Datalayer platform
- [ ] **Dirty State Indicator**: Add UI feedback when documents have unsaved changes
- [ ] **Error Handling**: Improve error messages and recovery mechanisms
- [ ] **Performance**: Optimize loading times for large notebooks

### Medium Priority

- [ ] **Keyboard Shortcuts**: Add customizable keyboard shortcuts for common operations
- [ ] **Offline Mode**: Better support for working with notebooks offline
- [ ] **Export Options**: Export notebooks to different formats (PDF, HTML, etc.)
- [ ] **Collaboration**: Real-time collaboration features
- [ ] **Extensions**: Plugin system for custom cell types and renderers

### Low Priority

- [ ] **Multi-workspace**: Support for multiple Datalayer workspaces
- [ ] **Advanced Search**: Search across notebooks and documents
- [ ] **Backup System**: Automatic backup of work in progress
- [ ] **Integration**: Better integration with VS Code's built-in features

### Technical Debt

- [ ] **WebSocket Binary Support**: Implement newer Jupyter protocol v1.kernel.websocket.jupyter.org
- [ ] **Bundle Optimization**: Further reduce extension size and startup time
- [ ] **Memory Management**: Optimize memory usage for large notebooks
- [ ] **Test Coverage**: Increase automated test coverage

## Release History

### v0.0.2 (Current)

- Complete VS Code theme integration
- Spaces tree view with document management
- Lexical editor for rich text documents
- Runtime management with credit conservation
- Authentication system with GitHub enrichment

### v0.0.1 (Initial Release)

- Basic notebook editing functionality
- Jupyter kernel integration
- Custom VS Code editor provider

## Compatibility Matrix

| Extension Version | VS Code Version | Node.js Version | Status     |
| ----------------- | --------------- | --------------- | ---------- |
| 0.0.2             | ^1.98.0         | >= 20.0.0       | Current    |
| 0.0.1             | ^1.95.0         | >= 18.0.0       | Deprecated |

## Breaking Changes

### v0.0.2

- Minimum VS Code version increased to 1.98.0
- Node.js 20+ required for development
- Configuration property names changed (see migration guide)

## Support Policy

- **Current Version**: Full support with bug fixes and feature updates
- **Previous Version**: Security fixes only for 6 months
- **Deprecated Versions**: No support

For support and questions, please visit our [GitHub repository](https://github.com/datalayer/jupyter-ui).
