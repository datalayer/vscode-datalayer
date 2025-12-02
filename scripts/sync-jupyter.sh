#!/bin/bash
# Sync local Datalayer packages (@datalayer/core, jupyter-lexical, jupyter-react)
# to vscode-datalayer node_modules.
#
# This script builds all local packages and copies their lib/ outputs
# into the extension's node_modules for quick testing during development.
#
# Usage:
#   ./sync-jupyter.sh          # Run once and exit
#   ./sync-jupyter.sh --watch  # Watch for changes and auto-sync

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
JUPYTER_UI_ROOT="$( cd "$VSCODE_ROOT/../jupyter-ui" && pwd )"

# Function to perform the sync
sync_packages() {
  echo -e "${BLUE}🔄 Syncing Datalayer packages to vscode-datalayer...${NC}"

  # Build @datalayer/core
  echo -e "${BLUE}📦 Building @datalayer/core...${NC}"
  cd "$CORE_ROOT"
  npx gulp resources-to-lib
  npm run build:lib

  # Build jupyter-lexical (with resources)
  echo -e "${BLUE}📦 Building @datalayer/jupyter-lexical...${NC}"
  cd "$JUPYTER_UI_ROOT/packages/lexical"
  npx gulp resources-to-lib
  npm run build:lib

  # Build jupyter-react
  echo -e "${BLUE}📦 Building @datalayer/jupyter-react...${NC}"
  cd "$JUPYTER_UI_ROOT/packages/react"
  npm run build:lib

  # Copy all necessary files to vscode-datalayer node_modules
  echo -e "${BLUE}📋 Copying files to node_modules...${NC}"
  cd "$VSCODE_ROOT"

  # Create directories
  mkdir -p node_modules/@datalayer/core
  mkdir -p node_modules/@datalayer/jupyter-lexical
  mkdir -p node_modules/@datalayer/jupyter-react

  # Copy core: lib/, style/, package.json (and schema/ if it exists)
  cp -r "$CORE_ROOT/lib" node_modules/@datalayer/core/
  cp -r "$CORE_ROOT/style" node_modules/@datalayer/core/
  if [ -d "$CORE_ROOT/schema" ]; then
    cp -r "$CORE_ROOT/schema" node_modules/@datalayer/core/
  fi
  cp "$CORE_ROOT/package.json" node_modules/@datalayer/core/

  # Copy jupyter-lexical: lib/, style/, package.json
  cp -r "$JUPYTER_UI_ROOT/packages/lexical/lib" node_modules/@datalayer/jupyter-lexical/
  cp -r "$JUPYTER_UI_ROOT/packages/lexical/style" node_modules/@datalayer/jupyter-lexical/
  cp "$JUPYTER_UI_ROOT/packages/lexical/package.json" node_modules/@datalayer/jupyter-lexical/

  # Copy jupyter-react: lib/, package.json
  cp -r "$JUPYTER_UI_ROOT/packages/react/lib" node_modules/@datalayer/jupyter-react/
  cp "$JUPYTER_UI_ROOT/packages/react/package.json" node_modules/@datalayer/jupyter-react/

  echo -e "${GREEN}✅ Successfully synced at $(date +"%H:%M:%S")${NC}"
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

  echo -e "${BLUE}👁️  Watch mode enabled. Monitoring Datalayer packages for changes...${NC}"
  echo -e "${YELLOW}📁 Watching:${NC}"
  echo -e "${YELLOW}   - $CORE_ROOT/src${NC}"
  echo -e "${YELLOW}   - $JUPYTER_UI_ROOT/packages/lexical/src${NC}"
  echo -e "${YELLOW}   - $JUPYTER_UI_ROOT/packages/react/src${NC}"
  echo -e "${YELLOW}Press Ctrl+C to stop${NC}"
  echo ""

  # Initial sync
  sync_packages

  # Watch for changes in src directories and trigger sync
  # Using fswatch with:
  # -r: recursive
  # -e: exclude patterns (node_modules, lib, etc.)
  # -l 1: latency 1 second (debounce rapid changes)
  fswatch -r -l 1 \
    -e ".*" -i "\\.tsx?$" -i "\\.jsx?$" -i "\\.css$" \
    "$CORE_ROOT/src" \
    "$JUPYTER_UI_ROOT/packages/lexical/src" \
    "$JUPYTER_UI_ROOT/packages/react/src" | while read -r file; do
    echo -e "\n${YELLOW}📝 Change detected in: $(basename "$file")${NC}"
    sync_packages
  done
else
  # Single run mode
  sync_packages
fi
