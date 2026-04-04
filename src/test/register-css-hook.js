/*
 * Copyright (c) 2021-2025 Datalayer, Inc.
 *
 * MIT License
 */

/**
 * Register a require hook that handles .css imports by returning empty modules.
 * Required because @datalayer/core transitively imports @primer/react which
 * contains CSS file imports that Node.js cannot handle natively.
 */
require.extensions[".css"] = function () {
  return;
};
