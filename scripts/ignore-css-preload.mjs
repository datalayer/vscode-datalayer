/*
 * Copyright (c) 2021-2025 Datalayer, Inc.
 *
 * MIT License
 */

/**
 * ESM preload script that registers CJS require hooks for ignoring
 * CSS imports and browser-only packages. Compatible with Node 22+
 * when used with --import flag alongside tsx.
 */
import { createRequire, register } from 'module';
const require = createRequire(import.meta.url);

// Load the CJS ignore-css hooks
require('./ignore-css.js');

// Assets and CJS/ESM mismatches reached through tsx's ESM loader are handled
// there; see `browser-graph-hooks.mjs` for why this is a separate, async
// registration that must come after tsx's.
register('./browser-graph-hooks.mjs', import.meta.url);
