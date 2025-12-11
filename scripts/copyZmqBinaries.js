#!/usr/bin/env node
/**
 * Copy ZeroMQ modules to dist/node_modules/ for VSIX packaging
 * This follows VS Code Jupyter's approach of selectively copying only needed runtime modules
 * instead of including all production dependencies (which would be 100+ MB).
 */

const fs = require('fs');
const path = require('path');

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
      name: 'zeromqold',
      include: ['lib', 'prebuilds', 'build', 'package.json']
    },
    {
      name: 'cmake-ts',
      include: ['build', 'package.json']  // cmake-ts only needs build/ folder
    }
  ];

  for (const config of moduleConfigs) {
    const srcRoot = path.join(__dirname, '../node_modules', config.name);
    const destRoot = path.join(__dirname, '../dist/node_modules', config.name);

    if (!fs.existsSync(srcRoot)) {
      console.warn(`⚠️  ${config.name} module not found at ${srcRoot}`);
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
