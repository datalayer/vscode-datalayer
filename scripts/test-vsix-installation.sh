#!/bin/bash
# VSIX Installation Smoke Test
# Tests that the packaged VSIX can be installed and activated in VS Code

set -e  # Exit on error

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
cd "$PROJECT_ROOT"

echo "🔧 VSIX Installation Smoke Test"
echo "================================"
echo ""

# Step 1: Build VSIX
echo "📦 Step 1: Building VSIX package..."
npm run vsix

# Find the VSIX file
VSIX_FILE=$(ls -t *.vsix 2>/dev/null | head -n 1)
if [ -z "$VSIX_FILE" ]; then
  echo "❌ ERROR: No VSIX file found"
  exit 1
fi

echo "✅ Built VSIX: $VSIX_FILE"
echo ""

# Step 2: Install VSIX
echo "📥 Step 2: Installing VSIX into VS Code..."
code --install-extension "$VSIX_FILE" --force

echo "✅ VSIX installed"
echo ""

# Step 3: Create test workspace
echo "🏗️  Step 3: Creating test workspace..."
TEST_WORKSPACE=$(mktemp -d -t vsix-test-XXXXXX)
echo "Test workspace: $TEST_WORKSPACE"

# Create a simple test file
cat > "$TEST_WORKSPACE/test.ipynb" << 'EOF'
{
  "cells": [
    {
      "cell_type": "code",
      "execution_count": null,
      "metadata": {},
      "outputs": [],
      "source": ["print('Hello from VSIX test')"]
    }
  ],
  "metadata": {
    "kernelspec": {
      "display_name": "Python 3",
      "language": "python",
      "name": "python3"
    }
  },
  "nbformat": 4,
  "nbformat_minor": 4
}
EOF

echo "✅ Test workspace created"
echo ""

# Step 4: Launch VS Code and check extension activates
echo "🚀 Step 4: Launching VS Code to test activation..."
echo ""
echo "IMPORTANT: This will open VS Code."
echo "Please check:"
echo "  1. Extension appears in Extensions view"
echo "  2. No error notifications appear"
echo "  3. Extension activates (check Output > Datalayer)"
echo "  4. Commands are available (Cmd+Shift+P > 'Datalayer')"
echo ""
read -p "Press Enter to launch VS Code (Ctrl+C to cancel)..."

# Launch VS Code with the test workspace
code "$TEST_WORKSPACE/test.ipynb" --wait

echo ""
echo "👀 Step 5: Checking for activation errors..."

# Try to get extension status using VS Code CLI
EXTENSION_ID="datalayer.datalayer-jupyter-vscode"
if code --list-extensions | grep -q "$EXTENSION_ID"; then
  echo "✅ Extension is installed: $EXTENSION_ID"
else
  echo "❌ Extension not found: $EXTENSION_ID"
  exit 1
fi

# Cleanup
echo ""
echo "🧹 Cleaning up test workspace..."
rm -rf "$TEST_WORKSPACE"

echo ""
echo "✅ VSIX Installation Smoke Test Complete!"
echo ""
echo "Manual verification checklist:"
echo "  ✓ Extension installed successfully"
echo "  ✓ VS Code launched with test notebook"
echo "  ✓ Extension activated without errors"
echo "  ✓ Commands registered and available"
echo ""
echo "If all checks passed, the VSIX is ready for distribution!"
