#!/bin/bash
# Apply existing patches to node_modules
# This script is typically called automatically via the postinstall hook,
# but can be run manually if needed.

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

# On Netlify or other CI with caching issues, force reinstall packages that need patches
# This ensures we have clean npm versions before applying patches
if [ "$NETLIFY" = "true" ] || [ "$CI" = "true" ]; then
  echo -e "${YELLOW}🔄 CI detected - force reinstalling packages that need patches...${NC}"

  # Remove the specific packages that need patches
  rm -rf node_modules/cmake-ts

  # Reinstall them fresh from npm (with --ignore-scripts to prevent infinite loop)
  npm install cmake-ts --no-save --ignore-scripts
fi

echo -e "${BLUE}📝 Applying patches...${NC}"

# Check if patches directory exists and has patch files
if [ -d "patches" ] && [ -n "$(ls -A patches/*.patch 2>/dev/null)" ]; then
  npx patch-package
  echo -e "${GREEN}✅ Patches applied successfully${NC}"
else
  echo -e "${YELLOW}⏭️  No patches found - skipping patch application${NC}"
fi
