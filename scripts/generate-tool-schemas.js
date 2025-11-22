#!/usr/bin/env node
/*
 * Copyright (c) 2021-2025 Datalayer, Inc.
 *
 * MIT License
 */

/**
 * Auto-generate package.json languageModelTools from TypeScript tool definitions.
 * Properly parses TypeScript object literals without using eval().
 */

const fs = require("fs");
const path = require("path");

const PACKAGE_JSON_PATH = path.join(__dirname, "..", "package.json");
const TOOLS_DIR = path.join(__dirname, "..", "src", "tools", "definitions", "tools");

console.log("🔧 Generating tool schemas from TypeScript definitions...\n");

/**
 * Parse a TypeScript string literal (handles single/double quotes, backticks, escaping)
 */
function parseStringLiteral(str) {
  str = str.trim();
  const quote = str[0];
  if (quote !== '"' && quote !== "'" && quote !== '`') {
    throw new Error(`Not a string literal: ${str.substring(0, 20)}`);
  }
  
  let result = '';
  let i = 1;
  while (i < str.length - 1) {
    if (str[i] === '\\' && i + 1 < str.length - 1) {
      const next = str[i + 1];
      if (next === 'n') result += '\n';
      else if (next === 't') result += '\t';
      else if (next === 'r') result += '\r';
      else if (next === '\\') result += '\\';
      else if (next === quote) result += quote;
      else result += next;
      i += 2;
    } else {
      result += str[i];
      i++;
    }
  }
  return result;
}

/**
 * Parse a TypeScript array literal
 */
function parseArrayLiteral(str) {
  str = str.trim();
  if (!str.startsWith('[') || !str.endsWith(']')) {
    throw new Error(`Not an array: ${str.substring(0, 20)}`);
  }
  
  const items = [];
  let current = '';
  let depth = 0;
  let inString = false;
  let stringChar = null;
  
  for (let i = 1; i < str.length - 1; i++) {
    const char = str[i];
    const prev = str[i - 1];
    
    // Handle string boundaries
    if ((char === '"' || char === "'" || char === '`') && prev !== '\\') {
      if (!inString) {
        inString = true;
        stringChar = char;
      } else if (char === stringChar) {
        inString = false;
        stringChar = null;
      }
    }
    
    if (!inString) {
      if (char === '[' || char === '{') depth++;
      else if (char === ']' || char === '}') depth--;
      else if (char === ',' && depth === 0) {
        const trimmed = current.trim();
        if (trimmed) items.push(parseValue(trimmed));
        current = '';
        continue;
      }
    }
    
    current += char;
  }
  
  const trimmed = current.trim();
  if (trimmed) items.push(parseValue(trimmed));
  
  return items;
}

/**
 * Parse a TypeScript object literal
 */
function parseObjectLiteral(str) {
  str = str.trim();
  if (!str.startsWith('{') || !str.endsWith('}')) {
    throw new Error(`Not an object: ${str.substring(0, 20)}`);
  }
  
  const obj = {};
  let i = 1;
  let depth = 0;
  let inString = false;
  let stringChar = null;
  
  while (i < str.length - 1) {
    // Skip whitespace
    while (i < str.length - 1 && /\s/.test(str[i])) i++;
    if (i >= str.length - 1) break;
    
    // Parse key
    let key = '';
    while (i < str.length && str[i] !== ':') {
      key += str[i];
      i++;
    }
    key = key.trim();
    
    // Remove quotes from key if present
    if ((key.startsWith('"') && key.endsWith('"')) || (key.startsWith("'") && key.endsWith("'"))) {
      key = key.slice(1, -1);
    }
    
    i++; // Skip ':'
    
    // Skip whitespace after colon
    while (i < str.length && /\s/.test(str[i])) i++;
    
    // Parse value
    let value = '';
    depth = 0;
    inString = false;
    stringChar = null;
    
    while (i < str.length) {
      const char = str[i];
      const prev = i > 0 ? str[i - 1] : '';
      
      // Handle string boundaries
      if ((char === '"' || char === "'" || char === '`') && prev !== '\\') {
        if (!inString) {
          inString = true;
          stringChar = char;
        } else if (char === stringChar) {
          inString = false;
          stringChar = null;
        }
      }
      
      if (!inString) {
        if (char === '{' || char === '[') depth++;
        else if (char === '}' || char === ']') depth--;
        else if ((char === ',' || char === '}') && depth === 0) {
          break;
        }
      }
      
      value += char;
      i++;
    }
    
    // Skip comma if present
    if (i < str.length && str[i] === ',') i++;
    
    obj[key] = parseValue(value.trim());
  }
  
  return obj;
}

/**
 * Parse any TypeScript value
 */
function parseValue(str) {
  str = str.trim();
  
  // Remove "as const" suffix
  str = str.replace(/\s+as\s+const\s*$/, '');
  str = str.trim();
  
  // Boolean
  if (str === 'true') return true;
  if (str === 'false') return false;
  
  // Null/undefined
  if (str === 'null' || str === 'undefined') return null;
  
  // Number
  if (/^-?\d+\.?\d*$/.test(str)) {
    return str.includes('.') ? parseFloat(str) : parseInt(str, 10);
  }
  
  // String
  if (str.startsWith('"') || str.startsWith("'") || str.startsWith('`')) {
    return parseStringLiteral(str);
  }
  
  // Array
  if (str.startsWith('[')) {
    return parseArrayLiteral(str);
  }
  
  // Object
  if (str.startsWith('{')) {
    return parseObjectLiteral(str);
  }
  
  // Fallback: return as string
  return str;
}

/**
 * Extract tool definition from TypeScript file
 */
function extractToolDefinition(filePath) {
  const content = fs.readFileSync(filePath, "utf-8");
  
  // Find the export statement
  const match = content.match(/export const (\w+)Tool: ToolDefinition = \{([\s\S]*?)\n\};/);
  if (!match) {
    return null;
  }
  
  const toolObjStr = '{' + match[2] + '\n}';
  
  try {
    const tool = parseObjectLiteral(toolObjStr);
    
    return {
      name: tool.name,
      displayName: tool.displayName,
      toolReferenceName: tool.toolReferenceName || tool.name,
      modelDescription: tool.description,
      canBeReferencedInPrompt: true,
      inputSchema: {
        type: "object",
        properties: tool.parameters?.properties || {},
        required: tool.parameters?.required || []
      }
    };
  } catch (error) {
    console.error(`  ❌ Parse error: ${error.message}`);
    return null;
  }
}

// Read tool files and extract definitions
const toolFiles = fs.readdirSync(TOOLS_DIR)
  .filter(file => file.endsWith('.ts') && file !== 'index.ts')
  .sort();

console.log(`Found ${toolFiles.length} tool definition files\n`);

const toolContributions = [];

for (const file of toolFiles) {
  const filePath = path.join(TOOLS_DIR, file);
  const tool = extractToolDefinition(filePath);
  
  if (tool) {
    toolContributions.push(tool);
    console.log(`  ✅ ${tool.name}`);
  } else {
    console.log(`  ⚠️  Failed to extract ${file}`);
  }
}

console.log(`\n📦 Generated ${toolContributions.length} tool schemas`);

// Read and update package.json
const packageJson = JSON.parse(fs.readFileSync(PACKAGE_JSON_PATH, "utf-8"));

if (!packageJson.contributes) {
  packageJson.contributes = {};
}

// Keep the manually added datalayer_getActiveDocument at the beginning
const getActiveDocTool = packageJson.contributes.languageModelTools?.find(
  t => t.name === 'datalayer_getActiveDocument'
);

// Set the new tool list
if (getActiveDocTool) {
  packageJson.contributes.languageModelTools = [getActiveDocTool, ...toolContributions];
} else {
  packageJson.contributes.languageModelTools = toolContributions;
}

// Write back
fs.writeFileSync(PACKAGE_JSON_PATH, JSON.stringify(packageJson, null, 2) + "\n");

console.log(`\n✅ Updated package.json`);
console.log(`\nTotal tools: ${packageJson.contributes.languageModelTools.length}`);
