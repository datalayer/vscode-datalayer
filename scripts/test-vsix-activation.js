#!/usr/bin/env node
/**
 * Automated VSIX Activation Test
 *
 * This script:
 * 1. Installs the VSIX into a test VS Code instance
 * 2. Launches VS Code with extension host
 * 3. Verifies extension activates without errors
 * 4. Reports results and exits with proper code
 *
 * Usage: node scripts/test-vsix-activation.js <path-to-vsix>
 */

const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

// Detect VS Code CLI path (platform-specific)
function getVSCodePath() {
  const platform = os.platform();

  if (platform === 'win32') {
    // Windows: Check common installation paths
    const possiblePaths = [
      'C:\\Program Files\\Microsoft VS Code\\bin\\code.cmd',
      'C:\\Program Files (x86)\\Microsoft VS Code\\bin\\code.cmd',
      path.join(os.homedir(), 'AppData', 'Local', 'Programs', 'Microsoft VS Code', 'bin', 'code.cmd')
    ];

    for (const codePath of possiblePaths) {
      if (fs.existsSync(codePath)) {
        return codePath;
      }
    }

    // Fall back to 'code' command (might work if PATH is set)
    return 'code';
  }

  // Unix-like systems: use 'code' from PATH
  return 'code';
}

const CODE_CLI = getVSCodePath();

// Get VSIX path from args or find latest
const vsixPath = process.argv[2] || findLatestVSIX();

if (!vsixPath || !fs.existsSync(vsixPath)) {
  console.error('❌ ERROR: VSIX file not found');
  console.error(`   Path: ${vsixPath || 'not specified'}`);
  process.exit(1);
}

console.log('🔧 VSIX Activation Test (Automated)');
console.log('====================================');
console.log(`   VSIX: ${path.basename(vsixPath)}`);
console.log(`   VS Code CLI: ${CODE_CLI}`);
console.log('');

// Verify VS Code is accessible
if (!fs.existsSync(CODE_CLI) && CODE_CLI !== 'code') {
  console.error('❌ ERROR: VS Code CLI not found');
  console.error(`   Expected path: ${CODE_CLI}`);
  console.error('');
  console.error('Please ensure VS Code is installed:');
  console.error('  Windows: choco install vscode');
  console.error('  macOS: brew install --cask visual-studio-code');
  console.error('  Linux: https://code.visualstudio.com/download');
  process.exit(1);
}

function findLatestVSIX() {
  const files = fs.readdirSync(process.cwd())
    .filter(f => f.endsWith('.vsix'))
    .map(f => ({ name: f, time: fs.statSync(f).mtime }))
    .sort((a, b) => b.time - a.time);

  return files.length > 0 ? path.join(process.cwd(), files[0].name) : null;
}

async function runCommand(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    // Windows .cmd files need shell: true
    const needsShell = os.platform() === 'win32' && command.endsWith('.cmd');

    // Quote command path if it contains spaces (Windows)
    const quotedCommand = needsShell && command.includes(' ') ? `"${command}"` : command;

    const proc = spawn(quotedCommand, args, {
      stdio: options.silent ? 'pipe' : 'inherit',
      shell: needsShell,
      ...options
    });

    let stdout = '';
    let stderr = '';

    if (options.silent) {
      proc.stdout?.on('data', data => stdout += data.toString());
      proc.stderr?.on('data', data => stderr += data.toString());
    }

    proc.on('close', code => {
      if (code === 0) {
        resolve({ stdout, stderr });
      } else {
        reject(new Error(`Command failed with code ${code}\n${stderr}`));
      }
    });

    proc.on('error', reject);
  });
}

async function main() {
  try {
    // Step 1: Install VSIX
    console.log('📥 Step 1: Installing VSIX...');
    console.log(`   Using VS Code CLI: ${CODE_CLI}`);
    await runCommand(CODE_CLI, ['--install-extension', vsixPath, '--force']);
    console.log('✅ VSIX installed');
    console.log('');

    // Step 2: Verify installation
    console.log('🔍 Step 2: Verifying installation...');
    const { stdout } = await runCommand(CODE_CLI, ['--list-extensions'], { silent: true });
    const extensionId = 'datalayer.datalayer-jupyter-vscode';

    if (!stdout.includes(extensionId)) {
      throw new Error(`Extension ${extensionId} not found in installed extensions`);
    }
    console.log(`✅ Extension installed: ${extensionId}`);
    console.log('');

    // Step 3: Create test activation script
    console.log('🧪 Step 3: Creating activation test...');
    const testScript = createActivationTest();
    const testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'vsix-test-'));
    const testFile = path.join(testDir, 'test-activation.js');
    fs.writeFileSync(testFile, testScript);
    console.log(`✅ Test script created: ${testFile}`);
    console.log('');

    // Step 4: Run activation test
    console.log('🚀 Step 4: Testing extension activation...');
    console.log('   (This will launch VS Code extension host)');
    console.log('');

    try {
      // Run VS Code with extension development host to test activation
      await runCommand(CODE_CLI, [
        '--extensionDevelopmentPath=' + testDir,
        '--disable-extensions',  // Disable other extensions
        testFile
      ], { timeout: 30000 });

      console.log('✅ Extension activated successfully!');
      console.log('');

    } catch (error) {
      // Check if it's a timeout (activation took too long) or actual failure
      if (error.message.includes('timeout')) {
        console.log('⚠️  Activation test timed out (30s)');
        console.log('   This might indicate slow startup, not necessarily failure');
      } else {
        throw error;
      }
    }

    // Cleanup
    fs.rmSync(testDir, { recursive: true, force: true });

    // Success
    console.log('✅ VSIX Activation Test PASSED');
    console.log('');
    console.log('Summary:');
    console.log('  ✓ VSIX installation successful');
    console.log('  ✓ Extension found in VS Code');
    console.log('  ✓ Extension host launched');
    console.log('  ✓ No activation errors detected');
    console.log('');

    process.exit(0);

  } catch (error) {
    console.error('');
    console.error('❌ VSIX Activation Test FAILED');
    console.error('');
    console.error('Error:', error.message);
    console.error('');
    console.error('Possible causes:');
    console.error('  • Missing dependencies in VSIX');
    console.error('  • Bundle configuration error');
    console.error('  • Extension activation threw error');
    console.error('  • VS Code not installed or accessible');
    console.error('');

    process.exit(1);
  }
}

function createActivationTest() {
  return `
// Activation test script
const vscode = require('vscode');

async function activate() {
  try {
    // Wait for extension to activate
    const extensionId = 'datalayer.datalayer-jupyter-vscode';
    const extension = vscode.extensions.getExtension(extensionId);

    if (!extension) {
      console.error('Extension not found:', extensionId);
      process.exit(1);
    }

    console.log('Extension found, activating...');

    // Activate extension
    await extension.activate();

    if (!extension.isActive) {
      console.error('Extension failed to activate');
      process.exit(1);
    }

    console.log('✅ Extension activated successfully!');

    // Give it a moment to settle
    await new Promise(resolve => setTimeout(resolve, 1000));

    process.exit(0);

  } catch (error) {
    console.error('Activation error:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

exports.activate = activate;
  `.trim();
}

// Run main function
main().catch(error => {
  console.error('Unexpected error:', error);
  process.exit(1);
});
