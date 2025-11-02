#!/usr/bin/env node

/**
 * Custom script to apply fixes to @datalayer/jupyter-lexical
 * This replaces patch-package to avoid cache issues in CI
 */

const fs = require('fs');
const path = require('path');

const CANDIDATE_TARGET_DIRS = [
  path.join(
    __dirname,
    '..',
    'node_modules',
    '@datalayer',
    'jupyter-lexical',
    'lib',
    'plugins',
  ),
  path.join(
    __dirname,
    '..',
    'node_modules',
    '@datalayer',
    'jupyter-lexical',
    'dist',
    'plugins',
  ),
];
const FIXED_FILES_DIR = path.join(__dirname, 'fixed-files', 'jupyter-lexical');

console.log('🔧 Applying fixes to @datalayer/jupyter-lexical...');

// Copy fixed files
const filesToCopy = [
  'JupyterInputOutputPlugin.js',
  'JupyterInputOutputPlugin.d.ts',
  'JupyterInputOutputPlugin.js.map'
];

const targetDir = CANDIDATE_TARGET_DIRS.find(dir => fs.existsSync(dir));

if (!targetDir) {
  console.error(
    '❌ Target plugin directory not found. Thel @datalayer/jupyter-lexical dependency is missing or has an unexpected layout.',
  );
  console.error('Searched in:');
  CANDIDATE_TARGET_DIRS.forEach(dir => console.error(`  - ${dir}`));
  process.exit(1);
}

try {
  filesToCopy.forEach(file => {
    const source = path.join(FIXED_FILES_DIR, file);
    const target = path.join(targetDir, file);

    fs.mkdirSync(path.dirname(target), { recursive: true });

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
