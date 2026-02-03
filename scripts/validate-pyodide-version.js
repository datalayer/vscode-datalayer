#!/usr/bin/env node
/**
 * Auto-sync Pyodide version strings with the installed npm package.
 * Automatically fixes any mismatches - runs before compile/build.
 */

const fs = require('fs');
const path = require('path');

// Read installed Pyodide version from node_modules
// Handle both local node_modules and workspace-hoisted node_modules
let pyodidePackageJson;
try {
  // Try local node_modules first (standalone mode)
  pyodidePackageJson = require('../node_modules/pyodide/package.json');
} catch (err) {
  // Try root node_modules (workspace mode)
  try {
    pyodidePackageJson = require('../../node_modules/pyodide/package.json');
  } catch (err2) {
    // Fallback to require.resolve which uses Node's resolution algorithm
    try {
      const pyodidePath = require.resolve('pyodide/package.json');
      pyodidePackageJson = require(pyodidePath);
    } catch (err3) {
      console.error('❌ ERROR: Could not find pyodide package.json');
      console.error('   Tried: ../node_modules/pyodide/package.json');
      console.error('   Tried: ../../node_modules/pyodide/package.json');
      console.error('   Tried: require.resolve(\'pyodide/package.json\')');
      process.exit(1);
    }
  }
}
const installedVersion = pyodidePackageJson.version;

console.log(`[Pyodide Version Sync] Installed version: ${installedVersion}`);

// Files to sync
const filesToSync = [
  {
    path: 'src/kernel/clients/pyodideKernelClient.ts',
    pattern: /const pyodideVersion = "([\d.]+)";/,
    replace: (content, version) =>
      content.replace(/const pyodideVersion = "[\d.]+";/, `const pyodideVersion = "${version}";`),
    description: 'PyodideKernelClient'
  },
  {
    path: 'src/services/pyodide/nativeNotebookPreloader.ts',
    pattern: /const pyodideVersion = "([\d.]+)";/,
    replace: (content, version) =>
      content.replace(/const pyodideVersion = "[\d.]+";/, `const pyodideVersion = "${version}";`),
    description: 'NativeNotebookPreloader'
  },
  {
    path: 'src/services/pyodide/pyodidePreloader.ts',
    pattern: /const npmPyodideVersion = "([\d.]+)";/,
    replace: (content, version) =>
      content.replace(/const npmPyodideVersion = "[\d.]+";/, `const npmPyodideVersion = "${version}";`),
    description: 'PyodidePreloader (native)'
  },
  {
    path: 'package.json',
    pattern: /Native VS Code notebooks use a fixed version \(v([\d.]+) from npm package\)/,
    replace: (content, version) =>
      content.replace(
        /Native VS Code notebooks use a fixed version \(v[\d.]+ from npm package\)/,
        `Native VS Code notebooks use a fixed version (v${version} from npm package)`
      ),
    description: 'package.json config'
  }
];

let fixedCount = 0;

// Check and auto-fix each file
for (const file of filesToSync) {
  const filePath = path.join(__dirname, '..', file.path);
  const content = fs.readFileSync(filePath, 'utf8');
  const match = content.match(file.pattern);

  if (!match) {
    console.error(`❌ ERROR: Could not find version string in ${file.path}`);
    process.exit(1);
  }

  const foundVersion = match[1];
  if (foundVersion !== installedVersion) {
    // Auto-fix the mismatch
    const updatedContent = file.replace(content, installedVersion);
    fs.writeFileSync(filePath, updatedContent, 'utf8');
    console.log(`   ✅ ${file.description}: ${foundVersion} → ${installedVersion}`);
    fixedCount++;
  } else {
    console.log(`   ✓ ${file.description}: ${foundVersion}`);
  }
}

// Summary
if (fixedCount > 0) {
  console.log(`\n✅ Auto-synced ${fixedCount} file(s) to version ${installedVersion}`);
} else {
  console.log(`\n✅ All files already synced to version ${installedVersion}`);
}
