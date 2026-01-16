#!/bin/bash
# Smoke Test 01: Verify .vsix structure and pyodide inclusion
#
# This test verifies that:
# 1. The .vsix file is a valid ZIP archive
# 2. The pyodide module is included in node_modules/
# 3. All critical pyodide runtime files are present
# 4. Python packages (.whl) are NOT included (downloaded on-demand)
#
# Exit codes:
#   0 - Success
#   1 - Validation failed

set -e

VSIX_FILE="${1}"

if [ -z "$VSIX_FILE" ]; then
  echo "❌ ERROR: No .vsix file provided"
  echo "Usage: $0 <path-to-vsix-file>"
  exit 1
fi

if [ ! -f "$VSIX_FILE" ]; then
  echo "❌ ERROR: File not found: $VSIX_FILE"
  exit 1
fi

echo "📦 Verifying .vsix structure: $(basename "$VSIX_FILE")"
echo ""

# Create temporary directory for extraction
TEMP_DIR=$(mktemp -d)
trap "rm -rf $TEMP_DIR" EXIT

# Extract .vsix (it's a ZIP file)
echo "🔍 Extracting .vsix..."
unzip -q "$VSIX_FILE" -d "$TEMP_DIR" || {
  echo "❌ ERROR: Failed to extract .vsix (not a valid ZIP file)"
  exit 1
}

# Verify pyodide directory exists
# Pyodide is copied to dist/node_modules/pyodide during build (follows ZeroMQ pattern)
PYODIDE_DIR="$TEMP_DIR/extension/dist/node_modules/pyodide"
if [ ! -d "$PYODIDE_DIR" ]; then
  echo "❌ ERROR: pyodide module not found in .vsix"
  echo "Expected: extension/dist/node_modules/pyodide/"
  echo ""
  echo "Found dist/node_modules structure:"
  ls -la "$TEMP_DIR/extension/dist/node_modules/" 2>/dev/null || echo "  (dist/node_modules not found)"
  exit 1
fi

echo "✅ Pyodide directory found"
echo ""

# Verify critical pyodide runtime files (not .whl packages)
echo "🔍 Verifying essential pyodide runtime files..."
REQUIRED_FILES=(
  "package.json"
  "pyodide.js"
  "pyodide.asm.js"
  "pyodide.asm.wasm"
  "python_stdlib.zip"
)

MISSING_FILES=()
for file in "${REQUIRED_FILES[@]}"; do
  FILE_PATH="$PYODIDE_DIR/$file"
  if [ -f "$FILE_PATH" ]; then
    SIZE=$(stat -f%z "$FILE_PATH" 2>/dev/null || stat -c%s "$FILE_PATH" 2>/dev/null || echo "unknown")
    echo "  ✓ $file ($SIZE bytes)"
  else
    echo "  ✗ $file (missing)"
    MISSING_FILES+=("$file")
  fi
done

if [ ${#MISSING_FILES[@]} -gt 0 ]; then
  echo ""
  echo "❌ ERROR: Missing ${#MISSING_FILES[@]} critical file(s)"
  exit 1
fi

echo ""

# Count total number of pyodide files (should be ~14 essential files)
TOTAL_FILES=$(find "$PYODIDE_DIR" -type f | wc -l)
echo "📊 Total pyodide runtime files: $TOTAL_FILES (no .whl packages)"

# Calculate total size
if command -v du &> /dev/null; then
  TOTAL_SIZE=$(du -sh "$PYODIDE_DIR" | cut -f1)
  echo "📊 Total pyodide size: $TOTAL_SIZE"
fi

echo ""

# Verify native modules (ZeroMQ and other native dependencies)
echo "🔍 Verifying native modules..."
NATIVE_MODULES=("zeromq" "cmake-ts" "keytar" "ws" "prebuild-install" "bufferutil" "utf-8-validate")
MISSING_MODULES=()

for module in "${NATIVE_MODULES[@]}"; do
  MODULE_PATH="$TEMP_DIR/extension/dist/node_modules/$module"
  if [ -d "$MODULE_PATH" ]; then
    SIZE=$(du -sh "$MODULE_PATH" 2>/dev/null | cut -f1 || echo "unknown")
    echo "  ✓ $module ($SIZE)"
  else
    echo "  ✗ $module (missing)"
    MISSING_MODULES+=("$module")
  fi
done

if [ ${#MISSING_MODULES[@]} -gt 0 ]; then
  echo ""
  echo "❌ ERROR: Missing ${#MISSING_MODULES[@]} native module(s)"
  exit 1
fi

echo ""
echo "✅ .vsix structure validation passed"
