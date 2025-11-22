#!/usr/bin/env node
/*
 * Copyright (c) 2021-2025 Datalayer, Inc.
 *
 * MIT License
 */

/**
 * Script to auto-generate package.json languageModelTools from tool definitions.
 * This ensures schemas stay in sync between TypeScript definitions and package.json.
 */

const fs = require("fs");
const path = require("path");

const PACKAGE_JSON_PATH = path.join(__dirname, "..", "package.json");

try {
  // Dynamically import only the tool definitions and generator
  const toolsModule = require("../out/src/tools/definitions/tools/index.js");
  const generatorModule = require("../out/src/tools/definitions/generators/packageJsonGenerator.js");

  const allToolDefinitions = toolsModule.allToolDefinitions;
  const generateAllVSCodeToolContributions = generatorModule.generateAllVSCodeToolContributions;

  console.log("📦 Generating languageModelTools from tool definitions...\n");

  // Read package.json
  const packageJson = JSON.parse(fs.readFileSync(PACKAGE_JSON_PATH, "utf-8"));

  // Generate tool contributions
  const toolContributions = generateAllVSCodeToolContributions(allToolDefinitions);
  
  console.log(`✅ Generated ${toolContributions.length} tool contributions:\n`);
  toolContributions.forEach((tool) => {
    console.log(`   - ${tool.name} (ref: ${tool.toolReferenceName})`);
  });

  // Update package.json
  packageJson.contributes.languageModelTools = toolContributions;

  // Write back to package.json with pretty formatting
  fs.writeFileSync(PACKAGE_JSON_PATH, JSON.stringify(packageJson, null, 2) + "\n");

  console.log(`\n✅ Successfully updated ${PACKAGE_JSON_PATH}`);
  console.log("   All duplicate entries removed and toolReferenceNames corrected.\n");
  
} catch (error) {
  console.error("❌ Error generating tool schemas:", error.message);
  console.error("\n⚠️  Make sure to run 'npm run compile' first!\n");
  console.error("Stack trace:", error.stack);
  process.exit(1);
}

