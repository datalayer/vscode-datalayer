/*
 * Copyright (c) 2021-2025 Datalayer, Inc.
 *
 * MIT License
 */

/**
 * Fixes ESM compatibility issues in node_modules for the VS Code test runner.
 *
 * When the test runner loads extension code that imports @datalayer/core,
 * it transitively reaches ESM modules with two issues Node.js cannot handle:
 *
 * 1. CSS imports in @primer/react (ERR_UNKNOWN_FILE_EXTENSION)
 * 2. Directory imports in @datalayer/icons-react (ERR_UNSUPPORTED_DIR_IMPORT)
 *
 * This script patches both issues in node_modules so tests run without error.
 * The CSS and icon components are not needed in the Node.js test environment
 * since the extension UI runs in webpack-bundled webviews.
 *
 * Runs as part of postinstall.
 */

const fs = require('fs');
const path = require('path');

const NODE_MODULES = path.join(__dirname, '..', 'node_modules');

let cssFixedCount = 0;
let dirFixedCount = 0;

// --- Fix 1: Strip CSS imports from @primer/react ESM files ---
function fixCssImports(dir) {
  if (!fs.existsSync(dir)) {
    return;
  }

  const entries = fs.readdirSync(dir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);

    if (entry.isDirectory()) {
      fixCssImports(fullPath);
    } else if (entry.name.endsWith('.js') || entry.name.endsWith('.mjs')) {
      const content = fs.readFileSync(fullPath, 'utf8');
      const fixed = content.replace(
        /^import\s+['"][^'"]*\.css['"];?\s*$/gm,
        '// [stripped css import]'
      );

      if (fixed !== content) {
        fs.writeFileSync(fullPath, fixed, 'utf8');
        cssFixedCount++;
      }
    }
  }
}

// --- Fix 2: Fix directory imports in ESM files ---
function fixDirectoryImports(filePath) {
  if (!fs.existsSync(filePath)) {
    return;
  }

  const fileDir = path.dirname(filePath);
  const content = fs.readFileSync(filePath, 'utf8');

  // Match: export * from "./data1" or import { X } from "./data1"
  const fixed = content.replace(
    /((?:export|import)\s+(?:\*|{[^}]+})\s+from\s+['"])(\.\/[^'"]+)(['"])/g,
    (match, prefix, importPath, suffix) => {
      // Skip if already has an extension
      if (importPath.match(/\.\w+$/)) {
        return match;
      }

      // Check if it's a directory with an index.js
      const resolvedPath = path.join(fileDir, importPath);
      if (
        fs.existsSync(resolvedPath) &&
        fs.statSync(resolvedPath).isDirectory() &&
        fs.existsSync(path.join(resolvedPath, 'index.js'))
      ) {
        dirFixedCount++;
        return `${prefix}${importPath}/index.js${suffix}`;
      }

      return match;
    }
  );

  if (fixed !== content) {
    fs.writeFileSync(filePath, fixed, 'utf8');
  }
}

// Run fixes
const primerEsmDir = path.join(NODE_MODULES, '@primer', 'react', 'lib-esm');
fixCssImports(primerEsmDir);

const iconsReactIndex = path.join(
  NODE_MODULES,
  '@datalayer',
  'icons-react',
  'index.esm.js'
);
fixDirectoryImports(iconsReactIndex);

// Summary
const fixes = [];
if (cssFixedCount > 0) {
  fixes.push(`${cssFixedCount} CSS import(s) stripped from @primer/react`);
}
if (dirFixedCount > 0) {
  fixes.push(
    `${dirFixedCount} directory import(s) fixed in @datalayer/icons-react`
  );
}
if (fixes.length > 0) {
  console.log(`ESM compat fixes: ${fixes.join(', ')}`);
} else {
  console.log('No ESM compatibility fixes needed');
}
