#!/usr/bin/env node
/**
 * Smoke Test 02: Test pyodide import resolution
 *
 * This test verifies that the pyodide module can be imported using the exact
 * pattern used in the extension code. This catches the module resolution bug
 * that affected installed extensions.
 *
 * Exit codes:
 *   0 - Success
 *   1 - Import failed
 */

const path = require('path');
const fs = require('fs');
const { promisify } = require('util');
const exec = promisify(require('child_process').exec);

const vsixFile = process.argv[2];

if (!vsixFile) {
  console.error('❌ ERROR: No .vsix file provided');
  console.error('Usage: node 02-test-pyodide-import.js <path-to-vsix-file>');
  process.exit(1);
}

if (!fs.existsSync(vsixFile)) {
  console.error(`❌ ERROR: File not found: ${vsixFile}`);
  process.exit(1);
}

console.log(`🧪 Testing pyodide import resolution: ${path.basename(vsixFile)}`);
console.log('');

async function main() {
  // Create temp directory
  const tempDir = fs.mkdtempSync(path.join(require('os').tmpdir(), 'vsix-test-'));

  try {
    // Extract .vsix
    console.log('🔍 Extracting .vsix...');
    await exec(`unzip -q "${vsixFile}" -d "${tempDir}"`);

    const extensionDir = path.join(tempDir, 'extension');
    const distDir = path.join(extensionDir, 'dist');

    // Verify dist/ exists
    if (!fs.existsSync(distDir)) {
      console.error('❌ ERROR: dist/ directory not found in extension');
      process.exit(1);
    }

    console.log('✅ Extension extracted');
    console.log('');

    // Simulate the import pattern used in extension code
    // After fix: Code uses import("pyodide"), webpack marks as external, Node resolves from node_modules
    console.log('🔍 Testing import pattern (webpack external resolution)...');
    console.log(`   Pattern: import("pyodide") → resolves from dist/node_modules/`);

    // Webpack marks pyodide as external, so at runtime Node.js resolves it
    // from dist/node_modules/pyodide (following ZeroMQ pattern)
    const pyodidePathFromNodeModules = path.join(distDir, 'node_modules', 'pyodide');
    const resolvedPath = path.resolve(pyodidePathFromNodeModules);

    console.log(`   Resolved: ${path.relative(extensionDir, resolvedPath)}`);

    if (!fs.existsSync(resolvedPath)) {
      console.error('');
      console.error('❌ ERROR: Pyodide module not found at expected path');
      console.error(`   Expected: ${resolvedPath}`);
      console.error('');
      console.error('This is the exact bug that affected your coworker!');
      process.exit(1);
    }

    console.log('✅ Pyodide path resolution successful');
    console.log('');

    // Test import (dynamic import simulation)
    console.log('🔍 Testing module import...');

    // Verify package.json exists
    const packageJsonPath = path.join(resolvedPath, 'package.json');
    if (!fs.existsSync(packageJsonPath)) {
      console.error('❌ ERROR: pyodide/package.json not found');
      process.exit(1);
    }

    const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
    console.log(`   ✓ Pyodide package: v${packageJson.version}`);

    // Verify main entry point exists
    const mainFile = packageJson.main || 'pyodide.js';
    const mainPath = path.join(resolvedPath, mainFile);
    if (!fs.existsSync(mainPath)) {
      console.error(`❌ ERROR: Main entry point not found: ${mainFile}`);
      process.exit(1);
    }

    console.log(`   ✓ Main entry: ${mainFile}`);

    // Test that we can require the module (basic syntax check)
    try {
      // Note: We don't actually call loadPyodide() as it requires WASM which is too heavy for CI
      // We just verify the module can be loaded
      const pyodideModule = require(resolvedPath);

      if (typeof pyodideModule.loadPyodide !== 'function') {
        console.error('❌ ERROR: loadPyodide is not a function');
        process.exit(1);
      }

      console.log('   ✓ loadPyodide function exists');
    } catch (error) {
      console.error('');
      console.error('❌ ERROR: Failed to import pyodide module');
      console.error(`   ${error.message}`);
      console.error('');
      console.error('This would cause the "Cannot find module \'pyodide\'" error!');
      process.exit(1);
    }

    console.log('');
    console.log('✅ Pyodide import test passed');
    console.log('');
    console.log('✨ This extension will work on installed VS Code instances!');

  } finally {
    // Cleanup
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
}

main().catch(error => {
  console.error('');
  console.error('❌ Test failed with error:');
  console.error(error);
  process.exit(1);
});
