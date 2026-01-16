#!/usr/bin/env node
/**
 * Optimize @primer/react by removing duplicate builds.
 * Webpack uses commonjs externals, so we only need lib/ (CommonJS).
 * Remove lib-esm/ (ESM) and dist/ (UMD) to save ~4 MB.
 */

const fs = require('fs');
const path = require('path');

const primerPath = path.join(__dirname, '..', 'dist', 'node_modules', '@primer', 'react');

console.log('🎨 Optimizing @primer/react package...');

// Remove lib-esm/ (ESM build - not used)
const libEsmPath = path.join(primerPath, 'lib-esm');
if (fs.existsSync(libEsmPath)) {
  fs.rmSync(libEsmPath, { recursive: true, force: true });
  console.log('   Removed lib-esm/ (ESM build)');
}

// Remove dist/ (UMD build - not used)
const distPath = path.join(primerPath, 'dist');
if (fs.existsSync(distPath)) {
  fs.rmSync(distPath, { recursive: true, force: true });
  console.log('   Removed dist/ (UMD build)');
}

console.log('✅ @primer/react optimized - kept only lib/ (CommonJS)');
