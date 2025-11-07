#!/bin/bash
# Sync local @datalayer/core package to vscode-datalayer node_modules
# This script builds the local core package and copies its lib/ output
# into the extension's node_modules for quick testing during development.
#
# Usage:
#   ./sync-core.sh          # Run once and exit
#   ./sync-core.sh --watch  # Watch for changes and auto-sync

set -e

# Colors for output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Get the script directory and project root
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
VSCODE_ROOT="$( cd "$SCRIPT_DIR/.." && pwd )"
CORE_ROOT="$( cd "$VSCODE_ROOT/../core" && pwd )"

# Function to perform the sync
sync_package() {
  echo -e "${BLUE}🔄 Syncing @datalayer/core package to vscode-datalayer...${NC}"

  # Build core package
  echo -e "${BLUE}📦 Building @datalayer/core...${NC}"
  cd "$CORE_ROOT"
  npm run build:lib

  # Copy lib files to vscode-datalayer node_modules
  echo -e "${BLUE}📋 Copying lib files to node_modules...${NC}"
  cd "$VSCODE_ROOT"

  mkdir -p node_modules/@datalayer/core/lib

  # Copy the built lib directory
  cp -r "$CORE_ROOT/lib/"* node_modules/@datalayer/core/lib/
  
  # Also copy package.json if it exists (for proper module resolution)
  if [ -f "$CORE_ROOT/package.json" ]; then
    cp "$CORE_ROOT/package.json" node_modules/@datalayer/core/
  fi

  echo -e "${GREEN}✅ Successfully synced @datalayer/core at $(date +"%H:%M:%S")${NC}"
}

# Check if watch mode is requested
if [[ "$1" == "--watch" ]]; then
  # Check if fswatch is installed
  if ! command -v fswatch &> /dev/null; then
    echo -e "${YELLOW}⚠️  fswatch not found. Installing via Homebrew...${NC}"
    if command -v brew &> /dev/null; then
      brew install fswatch
    else
      echo -e "${YELLOW}⚠️  Homebrew not found. Please install fswatch manually:${NC}"
      echo -e "${YELLOW}    brew install fswatch${NC}"
      echo -e "${YELLOW}    or visit: https://github.com/emcrisostomo/fswatch${NC}"
      exit 1
    fi
  fi

  echo -e "${BLUE}👁️  Watch mode enabled. Monitoring @datalayer/core for changes...${NC}"
  echo -e "${YELLOW}📁 Watching:${NC}"
  echo -e "${YELLOW}   - $CORE_ROOT/src${NC}"
  echo -e "${YELLOW}   - $CORE_ROOT/datalayer_core${NC}"
  echo -e "${YELLOW}Press Ctrl+C to stop${NC}"
  echo ""

  # Initial sync
  sync_package

  # Watch for changes in src and Python source directories and trigger sync
  # Using fswatch with:
  # -r: recursive
  # -e: exclude patterns (node_modules, lib, etc.)
  # -l 1: latency 1 second (debounce rapid changes)
  fswatch -r -l 1 \
    -e ".*" -i "\\.tsx?$" -i "\\.jsx?$" -i "\\.py$" \
    "$CORE_ROOT/src" \
    "$CORE_ROOT/datalayer_core" | while read -r file; do
    echo -e "\n${YELLOW}📝 Change detected in: $(basename "$file")${NC}"
    sync_package
  done
else
  # Single run mode
  sync_package
fi
