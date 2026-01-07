#!/bin/bash
# Sync local Datalayer packages for development
# (@datalayer/core, @datalayer/jupyter-lexical, @datalayer/jupyter-react)
#
# NOTE: As of January 2025, we use official npm releases (0.0.21, 1.0.8, 2.0.2)
# and no longer need patches. This script is only for local development testing
# with unreleased changes from the monorepo.

set -e

# Colors for output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${YELLOW}⚠️  Using official npm releases - patches no longer needed${NC}"
echo -e "${BLUE}ℹ️  This script syncs local development versions only${NC}"
echo -e "${BLUE}ℹ️  Press Ctrl+C to cancel, or Enter to continue...${NC}"
read -r

echo -e "${BLUE}🔧 Syncing local Datalayer packages for development...${NC}"

# Get the script directory and project root
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
VSCODE_ROOT="$( cd "$SCRIPT_DIR/.." && pwd )"

cd "$VSCODE_ROOT"

# Sync the latest changes from all Datalayer packages (core + jupyter-ui)
echo -e "${BLUE}🔄 Syncing latest changes from Datalayer packages...${NC}"
bash "$SCRIPT_DIR/sync-jupyter.sh"

echo -e "${GREEN}✅ Local packages synced for development${NC}"
echo -e "${YELLOW}⚠️  Remember: CI uses official npm packages, not local versions${NC}"
