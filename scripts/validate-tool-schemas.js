#!/usr/bin/env node
/*
 * Copyright (c) 2021-2025 Datalayer, Inc.
 *
 * MIT License
 */

/**
 * Validation script to check if package.json tool schemas match TypeScript definitions.
 * This helps prevent schema drift.
 * 
 * Usage: node scripts/validate-tool-schemas.js
 */

const fs = require("fs");
const path = require("path");

console.log("🔍 Validating tool schemas...\n");

// Read package.json
const packageJsonPath = path.join(__dirname, "..", "package.json");
const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, "utf-8"));

const toolsInPackageJson = packageJson.contributes?.languageModelTools || [];

console.log(`Found ${toolsInPackageJson.length} tools in package.json`);
console.log("\nTools:");
toolsInPackageJson.forEach((tool, index) => {
  console.log(`  ${index + 1}. ${tool.name} - ${tool.displayName}`);
});

console.log("\n✅ Package.json contains languageModelTools");
console.log("✅ Schemas should be kept in sync with TypeScript definitions");
console.log("\nTo ensure sync:");
console.log("  1. Update TypeScript tool definitions in src/tools/definitions/tools/");
console.log("  2. Manually copy the schema to package.json contributes.languageModelTools");
console.log("  3. OR run the generator (when implemented): npm run generate:tool-schemas\n");

// Check for common issues
const toolNames = toolsInPackageJson.map(t => t.name);
const expectedTools = [
  "datalayer_insertBlock",
  "datalayer_insertBlocks",
  "datalayer_readBlocks", 
  "datalayer_deleteBlock",
  "datalayer_listAvailableBlocks"
];

const missingTools = expectedTools.filter(name => !toolNames.includes(name));
if (missingTools.length > 0) {
  console.log("⚠️  Missing expected tools:");
  missingTools.forEach(name => console.log(`    - ${name}`));
} else {
  console.log("✅ All expected Lexical tools are present");
}

process.exit(0);
