/*
 * Copyright (c) 2021-2025 Datalayer, Inc.
 *
 * MIT License
 */

/**
 * Registers a Node.js module loader hook that handles .css imports.
 * Required because @datalayer/core transitively imports @primer/react
 * which contains CSS file imports that Node.js cannot handle natively.
 *
 * Usage: node --import ./src/test/register-css-hook.mjs
 */
import { register } from 'node:module';

register('./css-loader.mjs', import.meta.url);
