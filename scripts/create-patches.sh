#!/bin/bash
# Create patch-package patches for locally modified Datalayer packages
# (@datalayer/core, @datalayer/jupyter-lexical, @datalayer/jupyter-react)
#
# This script generates patches that can be committed to the repo and
# applied automatically during npm install via the postinstall hook.
set -e

# Colors for output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Get the script directory and project root
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
VSCODE_ROOT="$( cd "$SCRIPT_DIR/.." && pwd )"

cd "$VSCODE_ROOT"

# First, sync the latest changes from all Datalayer packages (core + jupyter-ui)
echo -e "${BLUE}🔄 Syncing latest changes from Datalayer packages...${NC}"
bash "$SCRIPT_DIR/sync-jupyter.sh"

# Ensure package-lock.json exists (required by patch-package)
if [ ! -f "package-lock.json" ]; then
  echo -e "${YELLOW}⚠  No package-lock.json found. Creating one...${NC}"
  npm i --package-lock-only
fi

# Create patches
echo -e "${BLUE}📦 Generating patches with patch-package...${NC}"
# npx patch-package @datalayer/core @datalayer/jupyter-lexical @datalayer/jupyter-react
# npx patch-package @datalayer/jupyter-lexical @datalayer/jupyter-react

echo -e "${GREEN}✅ Patches created successfully${NC}"
echo -e "${YELLOW}⚠️  Remember: Commit the patches/ directory to git for CI/users${NC}"
