#!/usr/bin/env node
/**
 * Validate l10n (internationalization) consistency across all translation files.
 *
 * Checks:
 *   1. Bundle key sync: EN and ES bundle files have identical key sets
 *   2. NLS key sync: EN and ES package NLS files have identical key sets
 *   3. Package.json refs: Every %key% in package.json resolves to package.nls.json
 *   4. No orphan NLS keys: Every key in package.nls.json is referenced by package.json
 *   5. No empty translations: All locale files have non-empty values
 *   6. Parameter consistency: {0}, {1} placeholders match between EN and locale bundles
 *   7. No hardcoded user-facing strings: Detects common patterns missing l10n wrapping
 *
 * Run: npm run check:l10n
 */

const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
let errors = 0;
let warnings = 0;

function error(msg) {
  console.error(`  ERROR: ${msg}`);
  errors++;
}

function warn(msg) {
  console.warn(`  WARN: ${msg}`);
  warnings++;
}

function pass(msg) {
  console.log(`  OK: ${msg}`);
}

function readJSON(relPath) {
  const fullPath = path.join(ROOT, relPath);
  if (!fs.existsSync(fullPath)) {
    error(`File not found: ${relPath}`);
    return null;
  }
  try {
    return JSON.parse(fs.readFileSync(fullPath, "utf8"));
  } catch (e) {
    error(`Invalid JSON in ${relPath}: ${e.message}`);
    return null;
  }
}

// --- Check 1 & 2: Key sync between EN and locale files ---

console.log("\n[1] Bundle key sync (l10n/)");
const enBundle = readJSON("l10n/bundle.l10n.json");
const esBundle = readJSON("l10n/bundle.l10n.es.json");

if (enBundle && esBundle) {
  const enKeys = new Set(Object.keys(enBundle));
  const esKeys = new Set(Object.keys(esBundle));
  const missingInES = [...enKeys].filter((k) => !esKeys.has(k));
  const extraInES = [...esKeys].filter((k) => !enKeys.has(k));

  if (missingInES.length) {
    error(
      `${missingInES.length} bundle keys missing in ES: ${missingInES.slice(0, 5).join(", ")}${missingInES.length > 5 ? "..." : ""}`,
    );
  }
  if (extraInES.length) {
    error(
      `${extraInES.length} extra bundle keys in ES: ${extraInES.slice(0, 5).join(", ")}${extraInES.length > 5 ? "..." : ""}`,
    );
  }
  if (!missingInES.length && !extraInES.length) {
    pass(`${enKeys.size} bundle keys match between EN and ES`);
  }
}

console.log("\n[2] NLS key sync (package.nls.*)");
const enNLS = readJSON("package.nls.json");
const esNLS = readJSON("package.nls.es.json");

if (enNLS && esNLS) {
  const enKeys = new Set(Object.keys(enNLS));
  const esKeys = new Set(Object.keys(esNLS));
  const missingInES = [...enKeys].filter((k) => !esKeys.has(k));
  const extraInES = [...esKeys].filter((k) => !enKeys.has(k));

  if (missingInES.length) {
    error(
      `${missingInES.length} NLS keys missing in ES: ${missingInES.slice(0, 5).join(", ")}${missingInES.length > 5 ? "..." : ""}`,
    );
  }
  if (extraInES.length) {
    error(
      `${extraInES.length} extra NLS keys in ES: ${extraInES.slice(0, 5).join(", ")}${extraInES.length > 5 ? "..." : ""}`,
    );
  }
  if (!missingInES.length && !extraInES.length) {
    pass(`${enKeys.size} NLS keys match between EN and ES`);
  }
}

// --- Check 3: %key% resolution ---

console.log("\n[3] Package.json %key% resolution");
const pkgContent = fs.readFileSync(path.join(ROOT, "package.json"), "utf8");
const keyRefs = [...pkgContent.matchAll(/%([^%\n]+)%/g)].map((m) => m[1]);

if (enNLS) {
  const unresolved = keyRefs.filter((r) => !(r in enNLS));
  if (unresolved.length) {
    error(
      `${unresolved.length} unresolved %key% refs: ${unresolved.join(", ")}`,
    );
  } else {
    pass(`All ${keyRefs.length} %key% refs resolve to package.nls.json`);
  }
}

// --- Check 4: Orphan NLS keys ---

console.log("\n[4] Orphan NLS keys");
if (enNLS) {
  const refsSet = new Set(keyRefs);
  const orphans = Object.keys(enNLS).filter((k) => !refsSet.has(k));
  if (orphans.length) {
    warn(
      `${orphans.length} NLS keys not referenced by package.json: ${orphans.slice(0, 5).join(", ")}${orphans.length > 5 ? "..." : ""}`,
    );
  } else {
    pass("No orphan NLS keys");
  }
}

// --- Check 5: Empty translations ---

console.log("\n[5] Empty translations");
if (esBundle) {
  const emptyBundle = Object.entries(esBundle)
    .filter(([, v]) => v === "")
    .map(([k]) => k);
  if (emptyBundle.length) {
    warn(
      `${emptyBundle.length} empty ES bundle translations: ${emptyBundle.slice(0, 3).join(", ")}${emptyBundle.length > 3 ? "..." : ""}`,
    );
  } else {
    pass("No empty ES bundle translations");
  }
}

if (esNLS) {
  const emptyNLS = Object.entries(esNLS)
    .filter(([k, v]) => v === "" && !k.endsWith(".modelDescription"))
    .map(([k]) => k);
  if (emptyNLS.length) {
    warn(
      `${emptyNLS.length} empty ES NLS translations: ${emptyNLS.slice(0, 3).join(", ")}${emptyNLS.length > 3 ? "..." : ""}`,
    );
  } else {
    pass(
      "No empty ES NLS translations (modelDescription keys excluded — AI-facing, not translated)",
    );
  }
}

// --- Check 6: Parameter placeholder consistency ---

console.log("\n[6] Parameter placeholder consistency");

/**
 * Extract {N} placeholders from a string.
 *
 * @param {string} str - The string to extract placeholders from.
 * @returns {string[]} Sorted array of unique placeholder tokens.
 */
function extractPlaceholders(str) {
  const matches = str.match(/\{(\d+)\}/g) || [];
  return [...new Set(matches)].sort();
}

if (enBundle && esBundle) {
  let paramErrors = 0;
  for (const [key, esVal] of Object.entries(esBundle)) {
    if (esVal === "") continue;
    const enPlaceholders = extractPlaceholders(key);
    const esPlaceholders = extractPlaceholders(esVal);

    if (enPlaceholders.join(",") !== esPlaceholders.join(",")) {
      error(
        `Placeholder mismatch for "${key.substring(0, 50)}...": EN has ${enPlaceholders.join(",")} but ES has ${esPlaceholders.join(",")}`,
      );
      paramErrors++;
    }
  }
  if (!paramErrors) {
    pass("All placeholder parameters match between EN and ES bundles");
  }
}

// --- Check 7: Detect missing l10n wrapping in source ---

console.log("\n[7] Missing l10n wrapping scan");

const USER_FACING_PATTERNS = [
  /(?:vscode\.)?window\.showInformationMessage\(\s*`[^`]*`/g,
  /(?:vscode\.)?window\.showErrorMessage\(\s*`[^`]*`/g,
  /(?:vscode\.)?window\.showWarningMessage\(\s*`[^`]*`/g,
  /(?:vscode\.)?window\.showInformationMessage\(\s*'[^']*'/g,
  /(?:vscode\.)?window\.showErrorMessage\(\s*'[^']*'/g,
  /(?:vscode\.)?window\.showWarningMessage\(\s*'[^']*'/g,
  /(?:vscode\.)?window\.showInformationMessage\(\s*"[^"]*"/g,
  /(?:vscode\.)?window\.showErrorMessage\(\s*"[^"]*"/g,
  /(?:vscode\.)?window\.showWarningMessage\(\s*"[^"]*"/g,
];

/**
 * Scan TypeScript files for user-facing strings not wrapped with l10n.
 *
 * @param {string} dir - Directory to scan.
 */
function scanDir(dir) {
  const fullDir = path.join(ROOT, dir);
  if (!fs.existsSync(fullDir)) return;

  const files = fs.readdirSync(fullDir, { recursive: true });
  for (const file of files) {
    if (!file.endsWith(".ts") && !file.endsWith(".tsx")) continue;
    if (file.includes("node_modules")) continue;
    if (file.includes(".test.") || file.includes("__test__")) continue;

    const filePath = path.join(fullDir, file);
    const content = fs.readFileSync(filePath, "utf8");
    const lines = content.split("\n");

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      // Skip lines that already use l10n
      if (line.includes("l10n.t(")) continue;
      // Skip comments
      if (line.trim().startsWith("//") || line.trim().startsWith("*")) continue;

      for (const pattern of USER_FACING_PATTERNS) {
        pattern.lastIndex = 0;
        if (pattern.test(line)) {
          warn(
            `${dir}/${file}:${i + 1} - Possible unwrapped user-facing string: ${line.trim().substring(0, 80)}`,
          );
        }
      }
    }
  }
}

scanDir("src");
scanDir("webview");

// --- Summary ---

console.log("\n" + "=".repeat(50));
if (errors > 0) {
  console.error(`FAILED: ${errors} error(s), ${warnings} warning(s)`);
  process.exit(1);
} else if (warnings > 0) {
  console.log(`PASSED with ${warnings} warning(s)`);
} else {
  console.log("PASSED: All l10n checks passed");
}
