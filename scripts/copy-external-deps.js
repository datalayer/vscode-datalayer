#!/usr/bin/env node
/**
 * Copy external dependencies to dist/node_modules/
 * These are marked as external in webpack.config.js and must be included in VSIX
 */

const fs = require('fs');
const path = require('path');

// External dependencies that need to be copied
// These match the externals in webpack.config.js
//
// NOTE: @datalayer/core and @datalayer/lexical-loro are NOT listed here because:
// - @datalayer/core is BUNDLED by webpack (not an external) - all imports are resolved at build time
// - @datalayer/lexical-loro is BUNDLED into the lexical webview by webpack
//
// @datalayer/jupyter-react and @datalayer/jupyter-lexical are also NOT listed as
// full package copies. Only their /tools subpaths are webpack externals, so we
// handle them specially below (see datalayerToolsPackages) to copy only:
// - package.json (for Node.js module resolution via "exports" field)
// - lib/tools/ (the actual runtime code)
const externalDeps = [
  '@github/keytar', // OS keyring access (ships prebuilt binaries for all platforms in tarball). Required for credential persistence and to share login state with the Datalayer CLI, which writes to the same OS keyring.
  'ws', // WebSocket library for Node.js - used by LoroAdapter for collaboration
  'zod', // Schema validation library - used by @datalayer/jupyter-react/tools
  'zod-to-json-schema', // Zod to JSON Schema converter - used by @datalayer/jupyter-react/tools
  '@toon-format/toon', // TOON format encoder - used by @datalayer/jupyter-react/tools
  'lexical',
  '@lexical/react',
  '@lexical/link',
  '@lexical/list',
  '@lexical/table',
  '@lexical/utils',
  '@lexical/dragon',
  '@lexical/rich-text',
  '@lexical/selection',
  '@lexical/code',
  '@lexical/text',
  '@lexical/history',
  '@lexical/clipboard',
  '@lexical/markdown',
  '@lexical/overflow',
  '@lexical/plain-text',
  '@lexical/file',
  '@lexical/hashtag',
  '@lexical/yjs',
  'react',
  'react-dom',
  '@primer/react',
  '@jupyterlab/application',
  '@jupyterlab/notebook',
  '@jupyterlab/cells',
  '@jupyterlab/completer',
];

// @datalayer packages where only the /tools subpath is a webpack external.
// We copy only package.json + lib/tools/ to avoid copying huge dist/ bundles
// (plotly.js, excalidraw, etc.) that add 300+ MB of unnecessary files.
const datalayerToolsPackages = [
  '@datalayer/jupyter-react',   // webpack external: @datalayer/jupyter-react/tools -> lib/tools/
  '@datalayer/jupyter-lexical',  // webpack external: @datalayer/jupyter-lexical/lib/tools -> lib/tools/
];

console.log('📦 Copying external dependencies to dist/node_modules/...');

const distNodeModules = path.join(__dirname, '..', 'dist', 'node_modules');

// Ensure dist/node_modules exists
if (!fs.existsSync(distNodeModules)) {
  fs.mkdirSync(distNodeModules, { recursive: true });
}

/**
 * Find a package by walking up the directory tree from the project root.
 * Works for both standalone repos (local node_modules) and monorepos
 * where dependencies are hoisted to an arbitrary ancestor.
 */
function findPackage(packageName) {
  let dir = path.resolve(__dirname, '..');
  while (true) {
    const candidate = path.join(dir, 'node_modules', packageName);
    if (fs.existsSync(candidate)) {
      return candidate;
    }
    const parent = path.dirname(dir);
    if (parent === dir) break; // reached filesystem root
    dir = parent;
  }
  return null;
}

function copyRecursive(src, dest) {
  if (!fs.existsSync(src)) {
    console.warn(`⚠️  Source not found: ${src}`);
    return;
  }

  const stats = fs.statSync(src);

  if (stats.isDirectory()) {
    const dirname = path.basename(src);

    // Skip nested node_modules directories entirely (huge space saver!)
    // Count how many times 'node_modules' appears in the path
    // Top-level: /path/to/node_modules/@datalayer/core = 1 occurrence
    // Nested: /path/to/node_modules/@datalayer/core/node_modules/prettier = 2 occurrences
    const nodeModulesCount = src.split(path.sep).filter(part => part === 'node_modules').length;
    if (dirname === 'node_modules' && nodeModulesCount >= 2) {
      return; // Skip nested node_modules directory (2+ occurrences means nested)
    }

    // Skip examples directories entirely
    if (dirname === 'examples' || dirname === 'example') {
      return;
    }

    // Skip test directories
    if (dirname === 'test' || dirname === 'tests' || dirname === '__tests__') {
      return;
    }

    // Skip .git directories (monorepo symlinked packages may include these)
    if (dirname === '.git') {
      return;
    }

    // Skip Python-related directories (monorepo packages contain Python code)
    if (dirname === '__pycache__' || dirname === '.mypy_cache') {
      return;
    }

    // Skip development/build directories not needed at runtime
    if (dirname === 'docs' || dirname === 'dev' ||
        dirname === 'public' || dirname === 'templates' ||
        dirname === 'jupyter-config' || dirname === 'conda-recipe' ||
        dirname === 'documents' || dirname === 'patches') {
      return;
    }

    if (!fs.existsSync(dest)) {
      fs.mkdirSync(dest, { recursive: true });
    }
    const entries = fs.readdirSync(src);
    for (const entry of entries) {
      copyRecursive(path.join(src, entry), path.join(dest, entry));
    }
  } else if (stats.isFile()) {
    // Skip development builds to reduce bundle size
    const filename = path.basename(src);
    const isLexicalPackage = src.includes('/lexical/') || src.includes('/@lexical/');
    const isReactPackage = src.includes('/react/') || src.includes('/react-dom/');

    // NEW: Skip nested node_modules directories (massive space saver)
    // Only copy from top-level node_modules, not nested dependencies
    // Use the src path itself to detect nested node_modules
    const srcParts = src.split(path.sep);
    const nmCount = srcParts.filter(part => part === 'node_modules').length;
    if (nmCount > 1) {
      return; // Skip nested node_modules
    }

    // NEW: Skip examples directories (5+ MB savings)
    if (src.includes('/examples/') || src.includes('/example/')) {
      return;
    }

    // NEW: Skip test directories and files
    if (src.includes('/test/') ||
        src.includes('/tests/') ||
        src.includes('/__tests__/') ||
        filename.includes('.test.') ||
        filename.includes('.spec.')) {
      return;
    }

    // NEW: Skip source maps (2-3 MB savings)
    if (filename.endsWith('.map') || filename.endsWith('.d.ts.map')) {
      return;
    }

    // NEW: Skip development tools in nested dependencies
    // prettier, eslint, webpack are typically build-time only
    if (src.includes('/prettier/') ||
        src.includes('/eslint/') ||
        src.includes('/webpack/')) {
      return;
    }

    // NEW: Skip lucide-react CJS format (only need ESM)
    // lucide-react has both ESM (7.7 MB) and CJS (860 KB) formats
    // We only need one format - keeping ESM for better tree-shaking
    if (src.includes('lucide-react') && src.includes('/dist/cjs/')) {
      return;
    }

    // Skip Primer React build-time metadata (not needed at runtime)
    if (src.includes('@primer/react/generated/')) {
      return;
    }

    // ALWAYS skip UMD builds (not used by webpack, even for React/Lexical)
    if (src.includes('/umd/')) {
      return;
    }

    // ALWAYS skip profiling builds (not needed in production)
    if (filename.includes('.profiling.')) {
      return;
    }

    // Skip dev builds for most packages, but KEEP for React/Lexical
    //
    // Why React/Lexical need both dev and prod builds:
    // React and Lexical use conditional requires based on process.env.NODE_ENV:
    //   if (process.env.NODE_ENV === 'production') {
    //     module.exports = require('./react.production.min.js');
    //   } else {
    //     module.exports = require('./react.development.js');
    //   }
    //
    // Even though webpack is in production mode, the require() happens at runtime
    // in the VS Code webview context, not at webpack build time. If we exclude
    // dev builds, the conditional require will fail in development scenarios.
    //
    // Size impact: ~1-2 MB total (acceptable for development flexibility)
    if (!isLexicalPackage && !isReactPackage) {
      if (filename.includes('.development.') || filename.includes('.dev.')) {
        return;
      }
    }

    // Skip React SSR and server-only modules (not needed in browser webviews)
    //
    // React Server-Side Rendering (SSR) modules:
    // - react-dom/server - Node.js SSR (renderToString, etc.)
    // - react-dom/server.browser - Browser-based SSR
    // - react-server-dom-* - React Server Components (RSC)
    //
    // Why we exclude these:
    // - VS Code webviews run in browser context (no Node.js SSR)
    // - SSR modules are large and not needed for client-side rendering
    // - Typical savings: 200-500 KB per SSR module
    //
    // Pattern rationale:
    // - Use .endsWith() instead of .includes() to avoid false positives
    // - 'my-server-utils.js' should NOT be excluded (legitimate utility)
    // - 'react-dom-server.js' SHOULD be excluded (SSR module)
    if (
      filename.endsWith('-server.js') ||
      filename.endsWith('-server.mjs') ||
      filename.endsWith('-server.cjs') ||
      filename.endsWith('-server.browser.js') ||
      filename.endsWith('-server.browser.mjs') ||
      filename.endsWith('-server.node.js') ||
      filename.endsWith('-server.node.mjs') ||
      // React Server Components (React 18+)
      filename.includes('react-server-dom') ||
      // Next.js server runtime (if ever used)
      filename.includes('server-runtime')
    ) {
      return;
    }

    // Skip metadata files (documentation and type definitions)
    if (filename === 'LICENSE' ||
        filename === 'LICENSE.txt' ||
        filename === 'README.md' ||
        filename === 'CHANGELOG.md' ||
        filename === 'CHANGELOG' ||
        filename === 'tsconfig.json' ||
        filename.endsWith('.d.ts') ||
        filename.endsWith('.d.mts')) {
      return;
    }

    fs.copyFileSync(src, dest);
  }
}

let copiedCount = 0;
let totalSize = 0;
const copiedPackages = new Set(); // Track copied packages to avoid duplicates

for (const dep of externalDeps) {
  // Check for duplicates (especially pyodide which appears in nested node_modules)
  if (copiedPackages.has(dep)) {
    console.log(`   ⏭️  Skipping duplicate ${dep}`);
    continue;
  }

  const sourcePath = findPackage(dep);
  const targetPath = path.join(distNodeModules, dep);

  if (sourcePath) {
    console.log(`   Copying ${dep}...`);
    copyRecursive(sourcePath, targetPath);
    copiedPackages.add(dep);
    copiedCount++;

    // Calculate size of what was actually copied (not source which may be much larger)
    const size = getDirectorySize(targetPath);
    totalSize += size;
  } else {
    console.warn(`⚠️  Skipping ${dep} (not found in node_modules)`);
  }
}

// Handle @datalayer packages that only need /tools subpath
// These are webpack externals only for the /tools export, so we copy:
// - package.json (required for Node.js "exports" resolution)
// - lib/tools/ (the actual runtime code for MCP tools)
// This saves ~370MB by NOT copying dist/ (plotly.js, excalidraw, etc.)
for (const dep of datalayerToolsPackages) {
  if (copiedPackages.has(dep)) {
    console.log(`   ⏭️  Skipping duplicate ${dep}`);
    continue;
  }

  const sourcePath = findPackage(dep);
  const targetPath = path.join(distNodeModules, dep);

  if (sourcePath) {
    console.log(`   Copying ${dep} (tools only)...`);

    // Create target directory
    if (!fs.existsSync(targetPath)) {
      fs.mkdirSync(targetPath, { recursive: true });
    }

    // Copy package.json (needed for "exports" field resolution)
    const pkgJsonSrc = path.join(sourcePath, 'package.json');
    if (fs.existsSync(pkgJsonSrc)) {
      fs.copyFileSync(pkgJsonSrc, path.join(targetPath, 'package.json'));
    }

    // Copy lib/tools/ directory (the actual runtime code)
    const toolsSrc = path.join(sourcePath, 'lib', 'tools');
    const toolsDest = path.join(targetPath, 'lib', 'tools');
    if (fs.existsSync(toolsSrc)) {
      copyRecursive(toolsSrc, toolsDest);
      const toolsSize = getDirectorySize(toolsDest);
      const toolsSizeMB = (toolsSize / (1024 * 1024)).toFixed(2);
      console.log(`      lib/tools/: ${toolsSizeMB}MB`);
      totalSize += toolsSize;
    } else {
      console.warn(`  ⚠️  lib/tools/ not found in ${dep}`);
    }

    copiedPackages.add(dep);
    copiedCount++;
  } else {
    console.warn(`⚠️  Skipping ${dep} (not found in node_modules)`);
  }
}

function getDirectorySize(dir) {
  let size = 0;
  try {
    const entries = fs.readdirSync(dir);
    for (const entry of entries) {
      const fullPath = path.join(dir, entry);
      const stats = fs.statSync(fullPath);
      if (stats.isDirectory()) {
        size += getDirectorySize(fullPath);
      } else {
        size += stats.size;
      }
    }
  } catch (err) {
    // Ignore errors
  }
  return size;
}

const sizeMB = (totalSize / (1024 * 1024)).toFixed(2);
console.log(`\n✅ Copied ${copiedCount} dependencies (~${sizeMB}MB)`);

// Final size report for dist/node_modules/
const finalSize = getDirectorySize(distNodeModules);
const finalSizeMB = (finalSize / (1024 * 1024)).toFixed(2);
console.log(`📊 Total dist/node_modules/ size: ${finalSizeMB}MB`);
if (finalSize > 50 * 1024 * 1024) {
  console.warn(`⚠️  dist/node_modules/ exceeds 50MB - consider further optimization`);
}
