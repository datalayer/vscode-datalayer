#!/bin/bash
# Orchestrator script for VS Code extension smoke tests
#
# This script discovers and runs all smoke tests in order.
# Tests can be shell scripts (.sh) or Node.js scripts (.js).
#
# Usage:
#   ./run-smoke-tests.sh <path-to-vsix-file>
#   ./run-smoke-tests.sh  # Auto-discovers .vsix in current dir or artifacts/
#
# Exit codes:
#   0 - All tests passed
#   1 - At least one test failed

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SMOKE_TESTS_DIR="$SCRIPT_DIR/smoke-tests"

echo "🧪 Running VS Code Extension Smoke Tests"
echo "========================================"
echo ""

# Find the .vsix file
if [ -n "$1" ]; then
  # Use provided argument
  VSIX_FILE="$1"
else
  # Auto-discover: try current directory first, then artifacts/
  VSIX_FILE=$(find . -name "*.vsix" -type f | head -1)

  if [ -z "$VSIX_FILE" ] && [ -d "artifacts" ]; then
    VSIX_FILE=$(find artifacts -name "*.vsix" -type f | head -1)
  fi
fi

if [ -z "$VSIX_FILE" ]; then
  echo "❌ ERROR: No .vsix file found"
  echo ""
  echo "Usage: $0 <path-to-vsix-file>"
  echo "   or: $0  # auto-discovers .vsix"
  echo ""
  echo "Searched in:"
  echo "  - Current directory"
  echo "  - ./artifacts/"
  exit 1
fi

if [ ! -f "$VSIX_FILE" ]; then
  echo "❌ ERROR: File not found: $VSIX_FILE"
  exit 1
fi

echo "📦 Testing extension: $(basename "$VSIX_FILE")"
echo "📍 Path: $VSIX_FILE"
echo ""

# Track test results
TOTAL_TESTS=0
PASSED_TESTS=0
FAILED_TESTS=0
FAILED_TEST_NAMES=()

# Function to run a single test
run_test() {
  local test_file="$1"
  local test_name="$(basename "$test_file")"

  TOTAL_TESTS=$((TOTAL_TESTS + 1))

  echo "▶ Running: $test_name"
  echo ""

  # Determine how to run the test based on extension
  if [[ "$test_file" == *.sh ]]; then
    if bash "$test_file" "$VSIX_FILE"; then
      PASSED_TESTS=$((PASSED_TESTS + 1))
      echo "✅ Passed: $test_name"
    else
      FAILED_TESTS=$((FAILED_TESTS + 1))
      FAILED_TEST_NAMES+=("$test_name")
      echo "❌ Failed: $test_name"
      return 1
    fi
  elif [[ "$test_file" == *.js ]]; then
    if node "$test_file" "$VSIX_FILE"; then
      PASSED_TESTS=$((PASSED_TESTS + 1))
      echo "✅ Passed: $test_name"
    else
      FAILED_TESTS=$((FAILED_TESTS + 1))
      FAILED_TEST_NAMES+=("$test_name")
      echo "❌ Failed: $test_name"
      return 1
    fi
  else
    echo "⚠ Skipping: $test_name (unknown file type)"
    TOTAL_TESTS=$((TOTAL_TESTS - 1))
  fi

  echo ""
}

# Run all numbered test files in order
# This handles both .sh and .js files
echo "========================================"
echo ""

# Get list of test files sorted by number
TEST_FILES=$(find "$SMOKE_TESTS_DIR" -maxdepth 1 \( -name "[0-9][0-9]-*.sh" -o -name "[0-9][0-9]-*.js" \) -type f | sort)

if [ -z "$TEST_FILES" ]; then
  echo "⚠ WARNING: No smoke tests found in $SMOKE_TESTS_DIR"
  exit 0
fi

# Run each test
CONTINUE_ON_ERROR=false  # Set to true to run all tests even if one fails
while IFS= read -r test_file; do
  if [ -f "$test_file" ]; then
    if ! run_test "$test_file"; then
      if [ "$CONTINUE_ON_ERROR" = false ]; then
        echo "========================================"
        echo "❌ Stopping: A smoke test failed"
        echo ""
        echo "Failed test: $(basename "$test_file")"
        echo ""
        echo "To continue running remaining tests after failures,"
        echo "set CONTINUE_ON_ERROR=true in this script."
        exit 1
      fi
    fi
  fi
done <<< "$TEST_FILES"

# Summary
echo "========================================"
echo "📊 Test Summary"
echo "========================================"
echo ""
echo "Total tests:  $TOTAL_TESTS"
echo "Passed:       $PASSED_TESTS"
echo "Failed:       $FAILED_TESTS"
echo ""

if [ $FAILED_TESTS -gt 0 ]; then
  echo "❌ Failed tests:"
  for test_name in "${FAILED_TEST_NAMES[@]}"; do
    echo "  - $test_name"
  done
  echo ""
  echo "Some smoke tests failed!"
  exit 1
else
  echo "✅ All smoke tests passed!"
  echo ""
  echo "✨ This extension is ready for deployment!"
  exit 0
fi
