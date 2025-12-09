#!/usr/bin/env node
/**
 * Downloads platform-specific ZeroMQ native binaries using Microsoft's @vscode/zeromq package.
 * This avoids the need for electron-rebuild or node-gyp compilation.
 * Based on VS Code Jupyter extension's approach.
 */

const { downloadZMQ } = require("@vscode/zeromq");

async function main() {
  console.log("📥 Downloading platform-specific ZeroMQ binaries...");
  try {
    await downloadZMQ();
    console.log("✅ ZeroMQ binaries downloaded successfully");
  } catch (error) {
    console.error("❌ Failed to download ZeroMQ binaries:", error);
    console.error("⚠️  Extension may not work correctly without ZMQ binaries");
    // Don't fail the install - fallback mechanism will handle it
    process.exit(0);
  }
}

main();
