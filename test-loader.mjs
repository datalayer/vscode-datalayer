/*
 * Copyright (c) 2021-2025 Datalayer, Inc.
 *
 * MIT License
 */

/**
 * ES Module loader to handle non-JS imports in test environment
 * This is needed because @primer/react ES modules try to import CSS files
 */

export async function resolve(specifier, context, nextResolve) {
  // Let default resolution handle everything
  return nextResolve(specifier, context);
}

export async function load(url, context, nextLoad) {
  // Handle CSS imports - return empty module
  if (url.endsWith('.css')) {
    return {
      format: 'module',
      shortCircuit: true,
      source: 'export default {};',
    };
  }

  // Pass through to next loader for everything else
  return nextLoad(url, context);
}
