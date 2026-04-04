/*
 * Copyright (c) 2021-2025 Datalayer, Inc.
 *
 * MIT License
 */

/**
 * Node.js ESM loader hook that handles .css imports by returning empty modules.
 * Required because @datalayer/core transitively imports @primer/react which
 * contains CSS file imports that Node.js cannot handle natively.
 */
export function load(url, context, nextLoad) {
  if (url.endsWith('.css')) {
    return {
      format: 'module',
      source: 'export default {};',
      shortCircuit: true,
    };
  }
  return nextLoad(url, context);
}
