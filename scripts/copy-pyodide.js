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
let sourceDir = path.join(__dirname, '..', 'node_modules', 'pyodide');
if (!fs.existsSync(sourceDir)) {
  // Try workspace root node_modules
  sourceDir = path.join(__dirname, '..', '..', 'node_modules', 'pyodide');
  if (!fs.existsSync(sourceDir)) {
    console.error('❌ ERROR: Could not find pyodide in node_modules');
    console.error('   Tried: ../node_modules/pyodide');
    console.error('   Tried: ../../node_modules/pyodide');
    process.exit(1);
  }
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
