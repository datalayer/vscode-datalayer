#!/usr/bin/env bash
# Check that every source directory has a README.md file.
# Excludes: node_modules, dist, out, fixtures, icons, .vscode-test, coverage

set -euo pipefail

DIRS_TO_CHECK="src webview scripts"
EXCLUDE_PATTERN="node_modules|dist|out|\.vscode-test|coverage|fixtures|icons"

missing=0
total=0

for dir in $(find $DIRS_TO_CHECK -type d | grep -vE "$EXCLUDE_PATTERN" | sort); do
  total=$((total + 1))
  if [ ! -f "$dir/README.md" ]; then
    echo "  Missing README.md: $dir/"
    missing=$((missing + 1))
  fi
done

echo ""
echo "Checked $total directories"

if [ $missing -gt 0 ]; then
  echo "$missing directories missing README.md"
  exit 1
else
  echo "All directories have README.md"
fi
