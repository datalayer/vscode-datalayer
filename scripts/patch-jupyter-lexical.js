#!/usr/bin/env node

/**
 * Custom script to apply fixes to @datalayer/jupyter-lexical
 * This replaces patch-package to avoid cache issues in CI
 */

const fs = require('fs');
const path = require('path');

const TARGET_DIR = path.join(__dirname, '..', 'node_modules', '@datalayer', 'jupyter-lexical', 'lib', 'plugins');
const FIXED_FILES_DIR = path.join(__dirname, 'fixed-files', 'jupyter-lexical');

console.log('🔧 Applying fixes to @datalayer/jupyter-lexical...');

// Copy fixed files
const filesToCopy = [
  'JupyterInputOutputPlugin.js',
  'JupyterInputOutputPlugin.d.ts',
  'JupyterInputOutputPlugin.js.map'
];

try {
  filesToCopy.forEach(file => {
    const source = path.join(FIXED_FILES_DIR, file);
    const target = path.join(TARGET_DIR, file);

    if (fs.existsSync(source)) {
      fs.copyFileSync(source, target);
      console.log(`✅ Copied ${file}`);
    } else {
      console.warn(`⚠️  Source file not found: ${file}`);
    }
  });

  console.log('✅ All fixes applied successfully!');
  process.exit(0);
} catch (error) {
  console.error('❌ Error applying fixes:', error.message);
  process.exit(1);
}
