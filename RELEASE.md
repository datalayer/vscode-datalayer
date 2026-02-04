# Release Guide

This document describes how to create and publish releases for the Datalayer VS Code extension.

## Quick Start

### Creating a Release

```bash
# Update version and create git tag
npm version patch  # or minor, or major

# Push to trigger automated release
git push origin main --follow-tags
```

That's it! GitHub Actions will automatically:

1. ✅ Run type checking and linting
2. ✅ Build the extension
3. ✅ Create a `.vsix` package
4. ✅ Generate changelog from git commits
5. ✅ Create a GitHub Release with artifacts
6. ✅ Publish to VS Code Marketplace (stable releases only)
7. ✅ Publish to Open VSX Registry (if configured)

### Version Types

```bash
# Patch release (0.0.3 → 0.0.4)
npm version patch

# Minor release (0.0.4 → 0.1.0)
npm version minor

# Major release (0.1.0 → 1.0.0)
npm version major

# Pre-release (0.0.4 → 0.0.5-beta.0)
npm version prerelease --preid=beta
```

| Version     | Example         | Published To           | GitHub Release    |
| ----------- | --------------- | ---------------------- | ----------------- |
| Patch       | `v0.0.4`        | Marketplace + Open VSX | Yes (latest)      |
| Minor       | `v0.1.0`        | Marketplace + Open VSX | Yes (latest)      |
| Major       | `v1.0.0`        | Marketplace + Open VSX | Yes (latest)      |
| Pre-release | `v0.0.4-beta.0` | GitHub only            | Yes (pre-release) |

## One-Time Setup

### 1. Configure GitHub Secrets

The automated release workflow requires secrets for publishing to marketplaces:

#### Required: `VSCE_PAT` - VS Code Marketplace Token

1. Go to https://dev.azure.com/
2. Sign in with your Microsoft account
3. Click profile icon → "Personal access tokens"
4. Click "New Token"
5. Configure:
   - **Name**: `vscode-marketplace-publish`
   - **Organization**: Select your organization or "All accessible organizations"
   - **Expiration**: Choose duration (e.g., 90 days, 1 year)
   - **Scopes**: Select "Marketplace" → Check "Acquire" and "Manage"
6. Click "Create" and copy the token
7. In GitHub: Settings → Secrets and variables → Actions → New repository secret
8. Name: `VSCE_PAT`, Value: (paste token)

#### Optional: `OVSX_PAT` - Open VSX Registry Token

1. Go to https://open-vsx.org/
2. Sign in or create an account
3. Go to User Settings → Access Tokens
4. Click "New Access Token"
5. Give it a name and click "Create"
6. Copy the token
7. In GitHub: Settings → Secrets and variables → Actions → New repository secret
8. Name: `OVSX_PAT`, Value: (paste token)

> **Note**: Open VSX publishing is optional and will not fail the release if the token is not set.

### 2. Verify Publisher Setup

Ensure your `package.json` has the correct publisher:

```json
{
  "publisher": "Datalayer",
  "name": "datalayer-jupyter-vscode"
}
```

Verify the publisher exists:

```bash
npx vsce show Datalayer.datalayer-jupyter-vscode
```

## Release Process

### Automatic Release (Recommended)

1. **Update version and create tag**

   ```bash
   npm version patch  # or minor, major, prerelease
   ```

2. **Push to GitHub**

   ```bash
   git push origin main --follow-tags
   ```

3. **Monitor the workflow**
   - Go to Actions tab in GitHub
   - Watch the "Release" workflow
   - Check Releases page after completion

### Manual Release (Alternative)

If automatic release fails or you need manual control:

1. **Build and package**

   ```bash
   npm run compile
   npm run vsix
   ```

2. **Test locally**

   ```bash
   code --install-extension datalayer-jupyter-vscode-0.0.4.vsix
   ```

3. **Publish to marketplace**

   ```bash
   npx vsce publish --packagePath datalayer-jupyter-vscode-0.0.4.vsix
   ```

4. **Create GitHub release**
   - Go to Releases → Draft a new release
   - Create tag (e.g., `v0.0.4`)
   - Upload `.vsix` file
   - Write release notes
   - Publish

## Testing Before Release

Test the extension locally before creating a release:

```bash
# Build and package
npm run compile
npm run vsix

# Install in VS Code
code --install-extension datalayer-jupyter-vscode-0.0.4.vsix

# Test functionality
# ... manual testing ...

# Uninstall when done
code --uninstall-extension Datalayer.datalayer-jupyter-vscode
```

### Test the Workflow with a Pre-release

Before your first stable release, test the workflow:

```bash
# Create a test pre-release
npm version prerelease --preid=test
git push origin main --follow-tags

# Monitor Actions tab to verify workflow succeeds

# If successful, create stable release
npm version patch
git push origin main --follow-tags
```

## Release Checklist

Before creating a release:

- [ ] All tests pass locally: `npm run compile && npm run lint && npx tsc --noEmit`
- [ ] Documentation is up to date
- [ ] Version in `package.json` is correct
- [ ] No uncommitted changes
- [ ] Main branch is up to date

## Monitoring and Verification

### During Release

Watch the workflow progress:

```
GitHub → Actions → Release workflow
```

### After Release

1. **Verify GitHub Release**
   - Check: `https://github.com/datalayer/vscode-datalayer/releases`
   - Download `.vsix` and verify it works

2. **Verify VS Code Marketplace**
   - Check: `https://marketplace.visualstudio.com/items?itemName=Datalayer.datalayer-jupyter-vscode`
   - Ensure new version is visible
   - Test installation: `code --install-extension Datalayer.datalayer-jupyter-vscode`

3. **Update documentation** (if needed)
   - Update README with new features
   - Share release notes with team

## Troubleshooting

### Release workflow fails on "Publish to VS Code Marketplace"

**Error**: `Error: Failed request: (401) Unauthorized`

**Solution**:

- Verify `VSCE_PAT` secret is set correctly
- Check if the token has expired
- Ensure token has "Marketplace: Manage" permissions
- Regenerate token if needed

### Version mismatch error

**Error**: `package.json version (0.0.3) does not match tag version (0.0.4)`

**Solution**:

- The version in `package.json` must match the git tag
- Always use `npm version` to update both simultaneously
- Never manually edit version in `package.json`

### Extension already exists at this version

**Error**: `Extension 'Datalayer.datalayer-jupyter-vscode version 0.0.4' already exists`

**Solution**:

- You cannot republish the same version to the marketplace
- Increment version: `npm version patch`
- Create new release

### VSIX file not found

**Error**: `*.vsix: no such file or directory`

**Solution**:

- Ensure build succeeded
- Check that `npm run vsix` works locally
- Verify webpack compilation completed
- Check for build errors in Actions logs

### Build fails

**Error**: TypeScript or lint errors

**Solution**:

- Fix errors locally first: `npm run compile && npm run lint && npx tsc --noEmit`
- Push fixes to main branch
- Then create release tag

### Marketplace token expired

**Error**: `401 Unauthorized` when publishing

**Solution**:

- Tokens expire based on duration you set
- Create new token following steps above
- Update `VSCE_PAT` secret in GitHub

### Changelog is empty

**Issue**: Release has no changelog entries

**Solution**:

- Ensure you have commits between previous and current tag
- Use conventional commit messages for better changelogs
- Manually edit release notes if needed

## Emergency Rollback

If you need to unpublish a version (use with extreme caution):

```bash
# Unpublish from VS Code Marketplace
npx vsce unpublish Datalayer.datalayer-jupyter-vscode@0.0.4

# Delete GitHub release
# Go to Releases → Click on release → Delete release

# Delete git tag locally and remotely
git tag -d v0.0.4
git push origin :refs/tags/v0.0.4
```

> **⚠️ Warning**: Unpublishing from the marketplace should be avoided. Users who already installed the extension will keep it, but new installations will fail. Consider publishing a patch version with fixes instead.

## Release Workflow Details

### What the Workflow Does

When you push a version tag (e.g., `v0.0.4`), the workflow:

1. **Validates**
   - Checks out code with full history
   - Verifies `package.json` version matches tag version

2. **Builds**
   - Installs dependencies
   - Runs type checking (`npx tsc --noEmit`)
   - Runs linter (`npm run lint`)
   - Compiles extension (`npm run compile`)

3. **Packages**
   - Creates `.vsix` package using vsce

4. **Publishes**
   - Generates changelog from git commits
   - Creates GitHub Release with `.vsix` attached
   - Publishes to VS Code Marketplace (stable releases only)
   - Publishes to Open VSX Registry (if `OVSX_PAT` configured)

5. **Notifies**
   - Outputs release URLs
   - Confirms successful publication

### Stable vs Pre-release

**Stable releases** (`v1.2.3`):

- Published to VS Code Marketplace
- Published to Open VSX Registry
- Marked as latest release on GitHub
- Users get automatic updates

**Pre-releases** (`v1.2.3-beta.0`, `v1.2.3-rc.1`):

- Published to GitHub Releases only
- Marked as pre-release
- NOT published to marketplaces
- Useful for testing before stable release

## Best Practices

### Commit Messages

Use clear, descriptive commit messages. They become your changelog:

```bash
# Good
git commit -m "Add support for remote kernel connections"
git commit -m "Fix memory leak in notebook renderer"
git commit -m "Update authentication flow for SSO"

# Avoid
git commit -m "fix"
git commit -m "updates"
git commit -m "wip"
```

### Version Bumping

Follow [Semantic Versioning](https://semver.org/):

- **Patch** (0.0.3 → 0.0.4): Bug fixes, minor changes
- **Minor** (0.0.4 → 0.1.0): New features, backwards compatible
- **Major** (0.1.0 → 1.0.0): Breaking changes

### Pre-release Testing

Always test with pre-releases before stable:

```bash
# Create beta release
npm version prerelease --preid=beta
git push origin main --follow-tags

# Test thoroughly
# If good, release stable
npm version patch
git push origin main --follow-tags
```

### Documentation

Keep these updated:

- `README.md` - User-facing features
- `CHANGELOG.md` - Detailed changes (optional, auto-generated)
- This file - Release process improvements

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

## Compatibility Matrix

| Extension Version | VS Code Version | Node.js Version | Status     |
| ----------------- | --------------- | --------------- | ---------- |
| 0.0.10            | ^1.107.0        | >= 22.0.0       | Current    |
| 0.0.2             | ^1.98.0         | >= 20.0.0       | Deprecated |

## Breaking Changes

### v0.0.10

- Minimum VS Code version increased to 1.107.0
- Node.js 22+ required for development
- Configuration property names changed (see migration guide)

## Support Policy

- **Current Version**: Full support with bug fixes and feature updates
- **Previous Version**: Security fixes only for 6 months
- **Deprecated Versions**: No support

## Resources

- [VS Code Publishing Extensions](https://code.visualstudio.com/api/working-with-extensions/publishing-extension)
- [vsce CLI Documentation](https://github.com/microsoft/vscode-vsce)
- [Open VSX Registry](https://open-vsx.org/)
- [Semantic Versioning](https://semver.org/)
- [Conventional Commits](https://www.conventionalcommits.org/)

## Support

- **GitHub Issues**: https://github.com/datalayer/vscode-datalayer/issues
- **Marketplace**: https://marketplace.visualstudio.com/items?itemName=Datalayer.datalayer-jupyter-vscode
- **Documentation**: https://vscode-datalayer.netlify.app

---

_Last Updated: January 2025_
