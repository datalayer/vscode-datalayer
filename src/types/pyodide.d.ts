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
  export interface PyodideInterface {
    runPythonAsync(
      code: string,
      options?: { globals?: any; locals?: any },
    ): Promise<any>;
    runPython(code: string, options?: { globals?: any; locals?: any }): any;
    loadPackage(packages: string | string[]): Promise<void>;
    loadPackagesFromImports(code: string): Promise<void>;
    registerJsModule(name: string, module: any): void;
    unregisterJsModule(name: string): void;
    setInterruptBuffer(buffer: Uint8Array): void;
    checkInterrupt(): void;
    toPy(obj: any): any;
    globals: any;
    pyodide_py: any;
    version: string;
    loadedPackages: Record<string, string>;
    isPyProxy(value: any): boolean;
    [key: string]: any;
  }
  /* eslint-enable @typescript-eslint/no-explicit-any */

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
