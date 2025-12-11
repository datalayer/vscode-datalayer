# Smoke Tests for VS Code Extension

This directory contains smoke tests that validate the `.vsix` extension package after it's built. These tests run in CI and can also be run locally to verify the extension works correctly when installed.

## What Are Smoke Tests?

Smoke tests are quick, high-level tests that verify the most critical functionality works. For our VS Code extension, they verify:

1. **Package Structure**: The .vsix contains all required files
2. **Module Resolution**: Dependencies like pyodide can be imported correctly
3. **Installation Readiness**: The extension will work when installed by users

## Test Organization

Tests are numbered with a prefix to control execution order:

- `01-verify-vsix-structure.sh` - Validates .vsix ZIP structure and pyodide inclusion
- `02-test-pyodide-import.js` - Tests the exact import pattern used in extension code
- `03-*` - Future tests (easy to add!)

## Running Tests Locally

### Run All Smoke Tests

```bash
# Build the extension first
npm run vsix

# Run all smoke tests
bash .github/scripts/run-smoke-tests.sh ./datalayer-jupyter-vscode-*.vsix
```

### Run Individual Test

```bash
# Test VSIX structure
bash .github/scripts/smoke-tests/01-verify-vsix-structure.sh ./datalayer-jupyter-vscode-*.vsix

# Test pyodide import
node .github/scripts/smoke-tests/02-test-pyodide-import.js ./datalayer-jupyter-vscode-*.vsix
```

## Adding New Smoke Tests

### 1. Create a New Test File

Choose a numbering scheme:
- `03-` through `09-` for high-priority tests (run first)
- `10-` through `99-` for additional tests

Example: `03-test-cache-directory.sh`

### 2. Follow the Template

**For Shell Scripts** (`.sh`):

```bash
#!/bin/bash
# Smoke Test XX: Brief description
#
# This test verifies that:
# 1. Thing one
# 2. Thing two
#
# Exit codes:
#   0 - Success
#   1 - Validation failed

set -e

VSIX_FILE="${1}"

if [ -z "$VSIX_FILE" ]; then
  echo "❌ ERROR: No .vsix file provided"
  exit 1
fi

echo "🧪 Testing: <what you're testing>"
echo ""

# Your test logic here

echo "✅ Test passed"
```

**For Node.js Scripts** (`.js`):

```javascript
#!/usr/bin/env node
/**
 * Smoke Test XX: Brief description
 *
 * Exit codes:
 *   0 - Success
 *   1 - Test failed
 */

const vsixFile = process.argv[2];

if (!vsixFile) {
  console.error('❌ ERROR: No .vsix file provided');
  process.exit(1);
}

console.log('🧪 Testing: <what you\'re testing>');

// Your test logic here

console.log('✅ Test passed');
```

### 3. Make It Executable

```bash
chmod +x .github/scripts/smoke-tests/XX-your-test.sh
```

### 4. Test Locally

```bash
bash .github/scripts/run-smoke-tests.sh ./your.vsix
```

### 5. Commit

The CI will automatically run your new test on all platforms!

## Current Tests

### 01-verify-vsix-structure.sh

**Purpose**: Verify .vsix package structure and pyodide inclusion

**What it checks**:
- .vsix is a valid ZIP file
- `extension/node_modules/pyodide/` directory exists
- Critical files present: `package.json`, `pyodide.js`, `pyodide.asm.js`
- Reports total file count and size

**Why it matters**: Catches packaging issues where dependencies are missing from the .vsix

### 02-test-pyodide-import.js

**Purpose**: Test pyodide import resolution using the exact pattern from extension code

**What it checks**:
- Simulates the `path.join(__dirname, "..", "..", "node_modules", "pyodide")` pattern
- Verifies the resolved path exists
- Tests that pyodide module can be required
- Validates `loadPyodide` function exists

**Why it matters**: This catches the exact bug that affected installed extensions where `require("pyodide")` failed with "Cannot find module" error

## CI Integration

These tests run automatically in GitHub Actions on every PR and push to main:

- **Platform Coverage**: Linux, macOS, Windows
- **When**: After extension is built and packaged
- **Fast**: No VS Code installation needed, just file validation
- **Clear Failures**: Each test has specific error messages

See `.github/workflows/build-extension.yml` for the CI configuration.

## Debugging Test Failures

### Test Failed Locally

1. Check the error message - tests provide specific details
2. Extract and inspect the .vsix manually:
   ```bash
   unzip -l your-extension.vsix | grep pyodide
   ```
3. Run the failing test with debug output:
   ```bash
   bash -x .github/scripts/smoke-tests/01-*.sh your.vsix
   ```

### Test Failed in CI

1. Check the GitHub Actions log for the specific test that failed
2. Download the .vsix artifact from the build job
3. Run the failing test locally with the downloaded .vsix
4. Check if it's platform-specific (only fails on macOS/Windows/Linux)

## Future Test Ideas

Want to add more tests? Here are some ideas:

- `03-test-cache-directory.sh` - Verify cache directory creation
- `04-verify-webview-bundle.sh` - Check webview assets are included
- `05-test-lexical-bundle.sh` - Verify lexical webview assets
- `06-verify-package-json.js` - Validate package.json in .vsix
- `07-test-sdk-integration.js` - Test SDK client initialization
- `08-verify-icons.sh` - Check all icons are included
- `09-test-commands.js` - Verify command registration data

## Questions?

If you have questions about the smoke tests:

1. Check existing tests as examples
2. Ask in a PR review or issue
3. Update this README with clarifications
