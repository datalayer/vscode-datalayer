#!/usr/bin/env node
/**
 * Copy ZeroMQ modules to dist/node_modules/ for VSIX packaging
 * This follows VS Code Jupyter's approach of selectively copying only needed runtime modules
 * instead of including all production dependencies (which would be 100+ MB).
 */

const fs = require('fs');
const path = require('path');

/**
 * Find a package in either local or monorepo root node_modules
 */
function findPackage(packageName) {
  // Try local node_modules first (standalone installation)
  const localPath = path.join(__dirname, '..', 'node_modules', packageName);
  if (fs.existsSync(localPath)) {
    return localPath;
  }

  // Try monorepo root node_modules (hoisted packages)
  const rootPath = path.join(__dirname, '..', '..', 'node_modules', packageName);
  if (fs.existsSync(rootPath)) {
    return rootPath;
  }

  return null;
}

function copyDir(src, dest) {
  if (!fs.existsSync(dest)) {
    fs.mkdirSync(dest, { recursive: true });
  }

  const entries = fs.readdirSync(src, { withFileTypes: true });

  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);

    if (entry.isDirectory()) {
      copyDir(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

async function main() {
  console.log('📦 Copying ZeroMQ modules for VSIX packaging...');

  // Only copy essential runtime files (not source code, build scripts, tests, etc.)
  // This mimics VS Code Jupyter's approach: only include what's needed to run
  const moduleConfigs = [
    {
      name: 'zeromq',
      include: ['lib', 'prebuilds', 'build', 'package.json']  // build/ contains manifest.json for cmake-ts
    },
    {
      name: 'cmake-ts',
      // Structure in dist/node_modules/cmake-ts/:
      //   package.json (root) ← from include
      //   build/loader.js ← from buildFiles
      //   build/loader.mjs ← from buildFiles
      include: ['package.json'],
      buildFiles: ['loader.js', 'loader.mjs']  // Only runtime loaders needed, not build tools
    },
    {
      name: 'keytar',
      include: ['lib', 'build', 'package.json']  // Includes rebuilt native binding for Electron
    },
    {
      name: 'ws',
      include: ['lib', 'package.json']  // WebSocket library used by kernel clients and Loro collaboration
    },
    {
      name: 'prebuild-install',
      include: ['lib', 'bin', 'rc.js', 'asset.js', 'index.js', 'download.js', 'util.js', 'error.js', 'proxy.js', 'package.json']  // Used by native modules like keytar
    },
    {
      name: 'bufferutil',
      include: ['index.js', 'fallback.js', 'build', 'package.json']  // Optional performance optimization for ws
    },
    {
      name: 'utf-8-validate',
      include: ['index.js', 'fallback.js', 'build', 'package.json']  // Optional performance optimization for ws
    }
  ];

  for (const config of moduleConfigs) {
    const srcRoot = findPackage(config.name);
    const destRoot = path.join(__dirname, '../dist/node_modules', config.name);

    if (!srcRoot) {
      console.warn(`⚠️  ${config.name} module not found at ${path.join(__dirname, '../node_modules', config.name)}`);
      continue;
    }

    // Create destination root
    if (!fs.existsSync(destRoot)) {
      fs.mkdirSync(destRoot, { recursive: true });
    }

    // Copy only the specified files/folders
    for (const item of config.include) {
      const srcPath = path.join(srcRoot, item);
      const destPath = path.join(destRoot, item);

      if (fs.existsSync(srcPath)) {
        const stats = fs.statSync(srcPath);
        if (stats.isDirectory()) {
          copyDir(srcPath, destPath);
        } else {
          fs.copyFileSync(srcPath, destPath);
        }
      }
    }

    // Copy specific build files if specified (for cmake-ts optimization)
    if (config.buildFiles) {
      const buildDir = path.join(destRoot, 'build');
      if (!fs.existsSync(buildDir)) {
        fs.mkdirSync(buildDir, { recursive: true });
      }
      for (const buildFile of config.buildFiles) {
        const srcPath = path.join(srcRoot, 'build', buildFile);
        const destPath = path.join(buildDir, buildFile);
        if (fs.existsSync(srcPath)) {
          fs.copyFileSync(srcPath, destPath);
        }
      }
    }

    console.log(`✅ Copied ${config.name} essentials to ${destRoot}`);
  }

  console.log('✅ All required modules copied successfully');
  console.log('📊 Checking size...');

  // Show size info
  const { execSync } = require('child_process');
  try {
    const size = execSync(`du -sh ${path.join(__dirname, '../dist/node_modules')}`, { encoding: 'utf8' });
    console.log(`   dist/node_modules/ size: ${size.trim()}`);
  } catch (e) {
    // Ignore size check errors
  }
}

main().catch(error => {
  console.error('❌ Failed to copy ZeroMQ modules:', error);
  process.exit(1);
});
