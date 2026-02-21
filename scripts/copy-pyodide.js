#!/usr/bin/env node
/**
 * Cross-platform script to copy essential pyodide files to dist/node_modules/
 * Follows the same pattern as ZeroMQ binaries (see copyZmqBinaries.js)
 *
 * IMPORTANT: Only copies essential runtime files (NOT .whl packages)
 * Python packages (.whl) are downloaded on-demand by Pyodide and cached locally
 * This reduces VSIX size by ~63MB!
 *
 * Files copied match package.json "files" field from pyodide npm package
 * Works on Windows, macOS, and Linux
 */

const fs = require('fs');
const path = require('path');

// Handle both local node_modules (standalone) and workspace-hoisted node_modules
// Search up to 5 levels above the package root to find pyodide in hoisted node_modules
const pkgRoot = path.resolve(__dirname, '..');
let sourceDir;
const triedPaths = [];
for (let i = 0; i <= 5; i++) {
  const candidate = path.join(pkgRoot, ...Array(i).fill('..'), 'node_modules', 'pyodide');
  triedPaths.push(candidate);
  if (fs.existsSync(candidate)) {
    sourceDir = candidate;
    break;
  }
}
if (!sourceDir) {
  console.error('❌ ERROR: Could not find pyodide in node_modules');
  for (const p of triedPaths) {
    console.error(`   Tried: ${p}`);
  }
  process.exit(1);
}
const targetDir = path.join(__dirname, '..', 'dist', 'node_modules', 'pyodide');

// Essential files from pyodide package.json "files" field
// .whl files are NOT included - they're downloaded on-demand
const essentialFiles = [
  'package.json',
  'pyodide.asm.js',
  'pyodide.asm.wasm',
  'python_stdlib.zip',
  'pyodide.mjs',
  'pyodide.js',
  'pyodide.js.map',
  'pyodide.mjs.map',
  'pyodide.d.ts',
  'ffi.d.ts',
  'pyodide-lock.json',
  'console.html',
  'console-v2.html',
  'README.md',  // Optional but helpful
];

console.log('📦 Copying essential pyodide files to dist/node_modules/...');
console.log(`   Source: ${sourceDir}`);
console.log(`   Target: ${targetDir}`);
console.log(`   Files: ${essentialFiles.length} essential files (excluding .whl packages)`);

// Ensure target directory exists
if (!fs.existsSync(targetDir)) {
  fs.mkdirSync(targetDir, { recursive: true });
}

// Copy only essential files
let copiedCount = 0;
let skippedCount = 0;

try {
  for (const file of essentialFiles) {
    const sourcePath = path.join(sourceDir, file);
    const targetPath = path.join(targetDir, file);

    if (fs.existsSync(sourcePath)) {
      fs.copyFileSync(sourcePath, targetPath);
      copiedCount++;
    } else {
      console.warn(`⚠️  File not found (skipping): ${file}`);
      skippedCount++;
    }
  }

  console.log(`✅ Copied ${copiedCount} files successfully`);
  if (skippedCount > 0) {
    console.log(`⚠️  Skipped ${skippedCount} missing files`);
  }
  console.log('💡 .whl packages excluded - they\'re downloaded on-demand (~63MB saved!)');
} catch (error) {
  console.error('❌ Failed to copy pyodide:', error.message);
  process.exit(1);
}
