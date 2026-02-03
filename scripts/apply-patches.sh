#!/bin/bash
# Apply existing patches to node_modules
# This script is called during postinstall to apply patches to dependencies

set -e

# Colors for output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Get the script directory and project root
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
VSCODE_ROOT="$( cd "$SCRIPT_DIR/.." && pwd )"

cd "$VSCODE_ROOT"

echo -e "${BLUE}📝 Applying patches to node_modules...${NC}"

# Check if patches directory exists
if [ ! -d "patches" ] || [ -z "$(ls -A patches/*.patch 2>/dev/null)" ]; then
  echo -e "${YELLOW}⏭️  No patches found - skipping${NC}"
  exit 0
fi

# Apply patches
npx patch-package
echo -e "${GREEN}✅ Patches applied successfully${NC}"
