#!/usr/bin/env node

/**
 * Custom script to apply fixes to @datalayer/jupyter-lexical
 * This replaces patch-package to avoid cache issues in CI
 */

const fs = require('fs');
const path = require('path');

// Resolve the workspace root (one level up from scripts/)
const WORKSPACE_ROOT = path.resolve(__dirname, '..');

console.log('🔧 Applying fixes to @datalayer/jupyter-lexical...');
console.log(`📂 Script directory: ${__dirname}`);
console.log(`📂 Workspace root: ${WORKSPACE_ROOT}`);
console.log(`📂 Process cwd: ${process.cwd()}`);

// Check if node_modules exists
const nodeModulesPath = path.join(WORKSPACE_ROOT, 'node_modules');
if (!fs.existsSync(nodeModulesPath)) {
  console.error(`❌ node_modules directory not found at: ${nodeModulesPath}`);
  console.error('npm install may not have completed successfully.');
  process.exit(1);
}
console.log(`✓ node_modules exists at: ${nodeModulesPath}`);

// Check if @datalayer/jupyter-lexical package exists
const packagePath = path.join(nodeModulesPath, '@datalayer', 'jupyter-lexical');
if (!fs.existsSync(packagePath)) {
  console.error(`❌ @datalayer/jupyter-lexical package not found at: ${packagePath}`);
  console.error('The dependency may not be installed correctly.');
  process.exit(1);
}
console.log(`✓ Package exists at: ${packagePath}`);

// List package contents to debug
console.log('📦 Package top-level contents:');
try {
  const contents = fs.readdirSync(packagePath);
  contents.forEach(item => {
    const itemPath = path.join(packagePath, item);
    const isDir = fs.statSync(itemPath).isDirectory();
    console.log(`  ${isDir ? '📁' : '📄'} ${item}`);
  });
} catch (err) {
  console.error(`⚠️  Could not list package contents: ${err.message}`);
}

const CANDIDATE_TARGET_DIRS = [
  path.join(packagePath, 'lib', 'plugins'),
  path.join(packagePath, 'dist', 'plugins'),
];
const FIXED_FILES_DIR = path.join(__dirname, 'fixed-files', 'jupyter-lexical');

console.log('� Searching for plugin directory in:');

console.log('🔍 Searching for plugin directory in:');
CANDIDATE_TARGET_DIRS.forEach(dir => {
  const exists = fs.existsSync(dir);
  console.log(`  ${exists ? '✓' : '✗'} ${dir}`);
});

// Copy fixed files
const filesToCopy = [
  'JupyterInputOutputPlugin.js',
  'JupyterInputOutputPlugin.d.ts',
  'JupyterInputOutputPlugin.js.map'
];

const targetDir = CANDIDATE_TARGET_DIRS.find(dir => fs.existsSync(dir));

if (!targetDir) {
  console.error(
    '❌ Target plugin directory not found. The @datalayer/jupyter-lexical dependency is missing or has an unexpected layout.',
  );
  console.error('Searched in:');
  CANDIDATE_TARGET_DIRS.forEach(dir => console.error(`  - ${dir}`));
  
  // Check if lib or dist directories exist at all
  const libPath = path.join(packagePath, 'lib');
  const distPath = path.join(packagePath, 'dist');
  console.error('\nChecking parent directories:');
  if (fs.existsSync(libPath)) {
    console.error(`  ✓ lib/ exists, contents:`);
    try {
      fs.readdirSync(libPath).forEach(item => console.error(`    - ${item}`));
    } catch (err) {
      console.error(`    Could not list: ${err.message}`);
    }
  } else {
    console.error(`  ✗ lib/ does not exist`);
  }
  if (fs.existsSync(distPath)) {
    console.error(`  ✓ dist/ exists, contents:`);
    try {
      fs.readdirSync(distPath).forEach(item => console.error(`    - ${item}`));
    } catch (err) {
      console.error(`    Could not list: ${err.message}`);
    }
  } else {
    console.error(`  ✗ dist/ does not exist`);
  }
  
  process.exit(1);
}

console.log(`✓ Found plugin directory: ${targetDir}`);

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
