/*
 * Copyright (c) 2021-2025 Datalayer, Inc.
 *
 * MIT License
 */

/**
 * Pre-initialization module
 *
 * This file is the ACTUAL webpack entry point. It preloads critical modules
 * before loading the main extension code.
 *
 * CRITICAL: This must use CommonJS require(), NOT ES6 imports, to ensure
 * the os module loads before ANY other code executes.
 */

// CRITICAL: Preload os module FIRST
// This ensures os is in Node's require cache before any other module loads
require("os");

// CRITICAL: Preload all native modules that call os.platform()
// These are externalized and load from node_modules at runtime
// They must load AFTER os is in the require cache

// prebuild-install is used by ws and other native modules
// It has os.platform() calls that will fail if os isn't loaded
try {
  require("prebuild-install");
} catch (e) {
  // Optional dependency, ignore if not found
}

// ws (WebSocket library) pulls in prebuild-install
// Imported by websocketKernelClient.ts and loroWebSocketAdapter.ts
try {
  require("ws");
} catch (e) {
  // Will fail later if actually needed
}

// NOTE: cmake-ts removed from preload - not needed at activation time
// zeromq only loads cmake-ts when actually connecting to local kernel
// Attempting to preload it causes "Identifier 'dp' has already been declared" error
// due to conflicts between patched source and pre-compiled build files

// Now load and re-export the actual extension
// Using require() here instead of import to maintain execution order control
const extension = require("./extension");

// Re-export all extension exports
module.exports = extension;
