/*
 * Copyright (c) 2021-2025 Datalayer, Inc.
 *
 * MIT License
 */

/**
 * Type declarations for Pyodide
 * Pyodide is loaded dynamically at runtime, so we declare module types here
 *
 * Note: Using 'unknown' for Python-JavaScript interop types as they are inherently dynamic
 */

/* eslint-disable @typescript-eslint/no-explicit-any */
declare module "pyodide" {
  /**
   * Interface for interacting with the Pyodide WebAssembly Python runtime.
   */
  export interface PyodideInterface {
    /** Runs Python code asynchronously and returns the result. */
    runPythonAsync(
      code: string,
      options?: { globals?: any; locals?: any },
    ): Promise<any>;
    /** Runs Python code synchronously and returns the result. */
    runPython(code: string, options?: { globals?: any; locals?: any }): any;
    /** Loads one or more Python packages into the Pyodide runtime. */
    loadPackage(packages: string | string[]): Promise<void>;
    /** Automatically loads packages required by the given Python code. */
    loadPackagesFromImports(code: string): Promise<void>;
    /** Registers a JavaScript module so it can be imported from Python. */
    registerJsModule(name: string, module: any): void;
    /** Unregisters a previously registered JavaScript module. */
    unregisterJsModule(name: string): void;
    /** Sets the shared interrupt buffer for cooperative interruption. */
    setInterruptBuffer(buffer: Uint8Array): void;
    /** Checks if an interrupt has been requested via the interrupt buffer. */
    checkInterrupt(): void;
    /** Converts a JavaScript object to a Python object. */
    toPy(obj: any): any;
    globals: any;
    pyodide_py: any;
    version: string;
    loadedPackages: Record<string, string>;
    /** Returns true if the given value is a PyProxy object. */
    isPyProxy(value: any): boolean;
    [key: string]: any;
  }
  /* eslint-enable @typescript-eslint/no-explicit-any */

  /**
   * Loads and initializes the Pyodide WebAssembly Python runtime.
   *
   * @param options - Configuration options for the Pyodide runtime.
   * @param options.indexURL - URL to load Pyodide files from.
   * @param options.fullStdLib - Whether to load the full Python standard library.
   * @param options.stdin - Custom stdin handler.
   * @param options.stdout - Custom stdout handler.
   * @param options.stderr - Custom stderr handler.
   * @param options.args - Command-line arguments for the Python interpreter.
   * @param options.env - Environment variables for the Python interpreter.
   * @param options.packages - Packages to pre-load during initialization.
   *
   * @returns A promise that resolves to the initialized Pyodide interface.
   */
  export function loadPyodide(options?: {
    indexURL?: string;
    fullStdLib?: boolean;
    stdin?: () => string;
    stdout?: (text: string) => void;
    stderr?: (text: string) => void;
    args?: string[];
    env?: Record<string, string>;
    packages?: string[];
  }): Promise<PyodideInterface>;
}
