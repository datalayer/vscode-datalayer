/*
 * Copyright (c) 2021-2025 Datalayer, Inc.
 *
 * MIT License
 */

/**
 * Test environment setup
 *
 * This file configures the test environment to handle non-JS imports
 * that occur when loading ES modules like @primer/react
 */

// Mock CSS imports - ES modules from @primer/react try to import .css files
// Node.js doesn't understand .css extensions, so we need to handle them
const Module = require("module");
const originalRequire = Module.prototype.require;

Module.prototype.require = function (id: string) {
  // Intercept CSS imports and return empty object
  if (id.endsWith(".css")) {
    return {};
  }
  // Pass through all other requires
  return originalRequire.apply(this, arguments);
};

console.log("✓ Test setup: CSS import handler configured");
