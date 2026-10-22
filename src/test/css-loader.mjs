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
  if (url.endsWith(".css")) {
    return {
      format: "module",
      source: "export default {};",
      shortCircuit: true,
    };
  }
  return nextLoad(url, context);
}

/**
 * Resolves the relative imports without an extension of `@datalayer`'s packages
 * (`lib/portable/activity.js` imports `./records`): their `lib` is ESM built
 * for bundlers, which Node's resolver refuses once the package is a real
 * dependency — `.js`, then `/index.js`, is tried for them and nothing else.
 *
 * @param specifier - What was imported.
 * @param context - Where from.
 * @param nextResolve - Node's own resolution.
 *
 * @returns The resolution.
 */
export async function resolve(specifier, context, nextResolve) {
  try {
    return await nextResolve(specifier, context);
  } catch (error) {
    const parent = context.parentURL ?? "";
    if (
      error?.code === "ERR_MODULE_NOT_FOUND" &&
      /^\.\.?\//.test(specifier) &&
      !/\.[a-z]+$/i.test(specifier) &&
      parent.includes("/node_modules/@datalayer/")
    ) {
      for (const suffix of [".js", "/index.js"]) {
        try {
          return await nextResolve(specifier + suffix, context);
        } catch {
          // The next suffix.
        }
      }
    }
    throw error;
  }
}
