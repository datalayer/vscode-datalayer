/*
 * Copyright (c) 2021-2025 Datalayer, Inc.
 *
 * MIT License
 */

/**
 * ESM loader hooks that let a browser-oriented module graph load under Node.
 *
 * `sync:tools` imports the notebook and lexical tool definitions, which drags in
 * the packages those live beside — JupyterLab, Primer, rjsf. Everything in that
 * graph normally goes through a bundler, and two of a bundler's jobs are missing
 * when Node imports it directly.
 *
 * `ignore-css.js` patches `Module.prototype.require`, which only covers CJS.
 * Anything reached through tsx's ESM loader arrives here instead.
 *
 * Registered with `module.register` rather than `registerHooks` because tsx's
 * hooks run in a loader worker, and only async hooks share that chain — the
 * synchronous ones never see what tsx resolves. It also has to be registered
 * *after* tsx in the `--import` list, since the last registration runs first.
 */

/**
 * Extensions a bundler would handle and Node cannot.
 *
 * JupyterLab packages import their own stylesheets and icons
 * (`apputils-extension` pulls in `style/scrollbar.raw.css`, `completer` pulls in
 * `style/icons/widget.svg`). This script reads tool metadata and renders
 * nothing, so each one only has to be harmless. Listed explicitly rather than
 * matched by "not JavaScript", so a genuinely unloadable module still fails.
 */
const ASSET_EXTENSIONS = [
  '.css',
  '.svg',
  '.png',
  '.jpg',
  '.jpeg',
  '.gif',
  '.webp',
  '.ico',
  '.woff',
  '.woff2',
  '.ttf',
  '.eot',
];

const emptyModule = new URL('./empty-module.mjs', import.meta.url).href;

/**
 * `@rjsf/utils` ships `main` as a CJS bundle and `module` as ESM sources.
 *
 * Bundlers take `module`; Node takes `main`, and then cannot statically detect
 * that bundle's named exports — `@jupyterlab/ui-components` imports
 * `ADDITIONAL_PROPERTY_FLAG` from it and the import fails. Point at the ESM
 * build the bundlers use instead.
 *
 * The format has to be forced along with it: those files are ESM syntax, but
 * the package declares no `"type": "module"`, so Node would read them as CJS
 * and fail on the `import` statements.
 */
const RJSF_CJS = '/@rjsf/utils/dist/';
const RJSF_ESM = '/@rjsf/utils/lib/';

export async function resolve(specifier, context, nextResolve) {
  if (ASSET_EXTENSIONS.some(extension => specifier.endsWith(extension))) {
    return { url: emptyModule, format: 'module', shortCircuit: true };
  }

  const resolved = await nextResolve(specifier, context);

  if (resolved.url.includes(RJSF_CJS)) {
    return {
      ...resolved,
      url: resolved.url.replace(RJSF_CJS, RJSF_ESM),
      format: 'module',
      shortCircuit: true,
    };
  }
  if (resolved.url.includes(RJSF_ESM)) {
    // Reached from inside that ESM build, whose relative imports resolve to
    // `.js` files Node would otherwise treat as CommonJS.
    return { ...resolved, format: 'module' };
  }

  return resolved;
}
