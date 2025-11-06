#!/bin/bash
# Create patch-package patches for locally modified datalayer packages
# This script generates patches that can be committed to the repo and
# applied automatically during npm install via the postinstall hook.

set -e

# Colors for output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${BLUE}🔧 Creating patches for datalayer packages...${NC}"

# Get the script directory and project root
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
VSCODE_ROOT="$( cd "$SCRIPT_DIR/.." && pwd )"

cd "$VSCODE_ROOT"

# First, sync the latest changes from local packages to ensure patches include all modifications
echo -e "${BLUE}🔄 Syncing latest changes from core...${NC}"
bash "$SCRIPT_DIR/sync-core.sh"

echo -e "${BLUE}🔄 Syncing latest changes from jupyter-ui...${NC}"
bash "$SCRIPT_DIR/sync-jupyter.sh"

# Ensure package-lock.json exists (required by patch-package)
if [ ! -f "package-lock.json" ]; then
  echo -e "${YELLOW}⚠️  No package-lock.json found. Creating one...${NC}"
  npm i --package-lock-only
fi

# Create patches
echo -e "${BLUE}📝 Generating patches with patch-package...${NC}"
npx patch-package @datalayer/core @datalayer/jupyter-lexical @datalayer/jupyter-react

echo -e "${GREEN}✅ Patches created successfully in patches/ directory${NC}"
echo -e "${BLUE}ℹ️  Patches will be applied automatically on 'npm install' via postinstall hook${NC}"
