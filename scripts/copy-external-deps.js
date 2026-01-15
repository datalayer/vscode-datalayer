#!/usr/bin/env node
/**
 * Copy external dependencies to dist/node_modules/
 * These are marked as external in webpack.config.js and must be included in VSIX
 */

const fs = require('fs');
const path = require('path');

// External dependencies that need to be copied
// These match the externals in webpack.config.js
const externalDeps = [
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

console.log('📦 Copying external dependencies to dist/node_modules/...');

const distNodeModules = path.join(__dirname, '..', 'dist', 'node_modules');
const sourceNodeModules = path.join(__dirname, '..', 'node_modules');

// Ensure dist/node_modules exists
if (!fs.existsSync(distNodeModules)) {
  fs.mkdirSync(distNodeModules, { recursive: true });
}

function copyRecursive(src, dest) {
  if (!fs.existsSync(src)) {
    console.warn(`⚠️  Source not found: ${src}`);
    return;
  }

  const stats = fs.statSync(src);

  if (stats.isDirectory()) {
    if (!fs.existsSync(dest)) {
      fs.mkdirSync(dest, { recursive: true });
    }
    const entries = fs.readdirSync(src);
    for (const entry of entries) {
      copyRecursive(path.join(src, entry), path.join(dest, entry));
    }
  } else if (stats.isFile()) {
    fs.copyFileSync(src, dest);
  }
}

let copiedCount = 0;
let totalSize = 0;

for (const dep of externalDeps) {
  const sourcePath = path.join(sourceNodeModules, dep);
  const targetPath = path.join(distNodeModules, dep);

  if (fs.existsSync(sourcePath)) {
    console.log(`   Copying ${dep}...`);
    copyRecursive(sourcePath, targetPath);
    copiedCount++;

    // Calculate size
    const size = getDirectorySize(sourcePath);
    totalSize += size;
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
