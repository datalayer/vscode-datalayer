/*
 * Copyright (c) 2021-2025 Datalayer, Inc.
 *
 * MIT License
 */

/**
 * @module utils/requirejsStub
 * Provides stub RequireJS implementation for VS Code webviews.
 *
 * ClassicWidgetManager from @datalayer/jupyter-react tries to load RequireJS,
 * which fails in VS Code webviews due to Content Security Policy restrictions.
 * When RequireJS fails to load, the widget manager tries to initialize anyway
 * and calls window.define(), which doesn't exist, causing the ready promise
 * to never resolve. This blocks ALL code execution.
 *
 * This stub provides minimal window.define and window.require implementations
 * to allow the widget manager to initialize successfully.
 */

/**
 * Initialize stub RequireJS implementation if not already available.
 * Should be called early in the webview initialization, before any
 * components that use jupyter-react are rendered.
 */
export function initializeRequireJSStub(): void {
  if (typeof window.define === "undefined") {
    // Stub define function - just stores the module
    const modules = new Map<string, unknown>();

    window.define = (name: string, module: unknown) => {
      modules.set(name, module);
    };

    // Stub require function - returns stored modules
    // @ts-expect-error - Simplified require stub doesn't match full Require interface
    window.require = (
      names: string[],
      callback?: (...modules: unknown[]) => void,
    ) => {
      if (callback) {
        const loadedModules = names.map((name) => modules.get(name));
        callback(...loadedModules);
      }
    };
  }
}

// Extend Window interface to include define/require
declare global {
  interface Window {
    define?: (name: string, module: unknown) => void;
    require?: (
      names: string[],
      callback?: (...modules: unknown[]) => void,
    ) => void;
  }
}
