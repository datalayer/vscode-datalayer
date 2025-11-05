#!/bin/bash
# Apply existing patches to node_modules
# This script is typically called automatically via the postinstall hook,
# but can be run manually if needed.

set -e

# Colors for output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}🔧 Applying patches...${NC}"

# Get the script directory and project root
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
VSCODE_ROOT="$( cd "$SCRIPT_DIR/.." && pwd )"

cd "$VSCODE_ROOT"

# Apply patches
npx patch-package

echo -e "${GREEN}✅ Patches applied successfully${NC}"
