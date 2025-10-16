/*
 * Copyright (c) 2021-2025 Datalayer, Inc.
 *
 * MIT License
 */

/**
 * Mock factory for creating test doubles of VS Code APIs and SDK components.
 * Provides pre-configured mocks with sensible defaults for testing.
 *
 * @module test/utils/mockFactory
 */

import * as vscode from "vscode";
import type { DatalayerClient as _DatalayerClient } from "@datalayer/core/lib/client";
import type { User as _User } from "@datalayer/core/lib/client/models/User";
import type { Runtime as _Runtime } from "@datalayer/core/lib/client/models/Runtime";
import type { ILogger } from "../../services/interfaces/ILogger";

/**
 * Creates a mock VS Code ExtensionContext for testing.
 * Includes in-memory implementations of secrets and global state.
 */
export function createMockExtensionContext(): vscode.ExtensionContext {
  const secrets = new Map<string, string>();
  const globalState = new Map<string, unknown>();
  const workspaceState = new Map<string, unknown>();

  const context: vscode.ExtensionContext = {
    subscriptions: [],
    extensionUri: vscode.Uri.file("/mock/extension/path"),
    extensionPath: "/mock/extension/path",
    environmentVariableCollection:
      {} as unknown as vscode.GlobalEnvironmentVariableCollection,
    storagePath: "/mock/storage",
    globalStoragePath: "/mock/global/storage",
    logPath: "/mock/logs",
    extensionMode: vscode.ExtensionMode.Test,

    secrets: {
      keys: async () => Array.from(secrets.keys()),
      get: async (key: string) => secrets.get(key),
      store: async (key: string, value: string) => {
        secrets.set(key, value);
      },
      delete: async (key: string) => {
        secrets.delete(key);
      },
      onDidChange: new vscode.EventEmitter<vscode.SecretStorageChangeEvent>()
        .event,
    },

    globalState: {
      keys: () => Array.from(globalState.keys()),
      get: <T>(key: string, defaultValue?: T) =>
        globalState.get(key) ?? defaultValue,
      update: async (key: string, value: unknown) => {
        globalState.set(key, value);
      },
      setKeysForSync: (_keys: readonly string[]) => {},
    },

    workspaceState: {
      keys: () => Array.from(workspaceState.keys()),
      get: <T>(key: string, defaultValue?: T) =>
        workspaceState.get(key) ?? defaultValue,
      update: async (key: string, value: unknown) => {
        workspaceState.set(key, value);
      },
    },

    asAbsolutePath: (relativePath: string) =>
      `/mock/extension/path/${relativePath}`,
    storageUri: vscode.Uri.file("/mock/storage"),
    globalStorageUri: vscode.Uri.file("/mock/global/storage"),
    logUri: vscode.Uri.file("/mock/logs"),
    extension: {} as unknown as vscode.Extension<unknown>,
    languageModelAccessInformation:
      {} as unknown as vscode.LanguageModelAccessInformation,
  };

  return context;
}

/**
 * Creates a mock User object for testing authentication.
 */
export function createMockUser(overrides?: Record<string, unknown>): unknown {
  return {
    uid: "mock-user-id",
    handle: "urn:dla:iam:ext::github:123456",
    email: "test@example.com",
    firstName: "Test",
    lastName: "User",
    displayName: "Test User",
    avatarUrl: "https://example.com/avatar.jpg",
    roles: ["platform_member"],
    ...overrides,
  };
}

/**
 * Creates a mock Runtime object for testing.
 */
export function createMockRuntime(
  overrides?: Record<string, unknown>,
): unknown {
  return {
    uid: "mock-runtime-id",
    podName: "mock-pod-123",
    givenName: "Test Runtime",
    environmentName: "python-cpu-env",
    environmentTitle: "Python CPU",
    type: "notebook",
    burningRate: 0.5,
    ingress: "https://mock.datalayer.run/jupyter/server/pool/mock-runtime",
    token: "mock-jwt-token",
    startedAt: new Date().toISOString(),
    expiredAt: "",
    ...overrides,
  };
}

/**
 * Simple spy function that tracks calls and allows setting return values.
 */
export class SpyFunction<T = unknown> {
  public calls: unknown[][] = [];
  public returnValue: T | undefined;
  public resolveValue: T | undefined;
  public rejectValue: Error | undefined;

  mockReturnValue(value: T): this {
    this.returnValue = value;
    return this;
  }

  mockResolvedValue(value: T): this {
    this.resolveValue = value;
    return this;
  }

  mockRejectedValue(error: Error): this {
    this.rejectValue = error;
    return this;
  }

  call(...args: unknown[]): unknown {
    this.calls.push(args);

    if (this.rejectValue) {
      return Promise.reject(this.rejectValue);
    }
    if (this.resolveValue !== undefined) {
      return Promise.resolve(this.resolveValue);
    }
    return this.returnValue;
  }

  reset(): void {
    this.calls = [];
    this.returnValue = undefined;
    this.resolveValue = undefined;
    this.rejectValue = undefined;
  }
}

/**
 * Mock logger for testing.
 */
export interface MockLogger extends ILogger {
  trace: (...args: unknown[]) => void;
  debug: (...args: unknown[]) => void;
  info: (...args: unknown[]) => void;
  warn: (...args: unknown[]) => void;
  error: (...args: unknown[]) => void;
  timeAsync: <T>(op: string, fn: () => Promise<T>) => Promise<T>;
}

/**
 * Creates a mock logger for testing.
 */
export function createMockLogger(): ILogger {
  return {
    trace: () => {},
    debug: () => {},
    info: () => {},
    warn: () => {},
    error: () => {},
    timeAsync: async <T>(_op: string, fn: () => Promise<T>) => fn(),
  };
}

/**
 * Type for a spy function with all spy methods.
 */
export interface MockSpyFunction {
  (...args: unknown[]): unknown;
  calls: unknown[][];
  mockReturnValue: <T>(value: T) => MockSpyFunction;
  mockResolvedValue: <T>(value: T) => MockSpyFunction;
  mockRejectedValue: (error: Error) => MockSpyFunction;
  reset: () => void;
}

/**
 * Type for the mock SDK returned by createMockSDK.
 */
export interface MockSDK {
  // IAM methods (nested structure - legacy)
  iam: {
    getIdentity: MockSpyFunction;
    validateToken: MockSpyFunction;
    getAuthenticationUrl: MockSpyFunction;
    exchangeCodeForToken: MockSpyFunction;
  };
  // Runtime methods (nested structure - legacy)
  runtimes: {
    list: MockSpyFunction;
    create: MockSpyFunction;
    get: MockSpyFunction;
    terminate: MockSpyFunction;
    environments: MockSpyFunction;
  };
  // Spacer methods (nested structure - legacy)
  spacer: {
    items: {
      getSpaceItems: MockSpyFunction;
      createNotebook: MockSpyFunction;
      createLexical: MockSpyFunction;
      updateItem: MockSpyFunction;
      deleteItem: MockSpyFunction;
    };
    users: {
      getUserSpaces: MockSpyFunction;
    };
  };
  // Flat SDK methods (actual DatalayerClient interface)
  whoami: MockSpyFunction;
  login: MockSpyFunction;
  logout: MockSpyFunction;
  setToken: MockSpyFunction;
  getToken: MockSpyFunction;
  listEnvironments: MockSpyFunction;
  ensureRuntime: MockSpyFunction;
  createRuntime: MockSpyFunction;
  listRuntimes: MockSpyFunction;
  getRuntime: MockSpyFunction;
  deleteRuntime: MockSpyFunction;
  getMySpaces: MockSpyFunction;
  createNotebook: MockSpyFunction;
  getNotebook: MockSpyFunction;
  updateNotebook: MockSpyFunction;
  createLexical: MockSpyFunction;
  getLexical: MockSpyFunction;
  updateLexical: MockSpyFunction;
  getSpaceItems: MockSpyFunction;
  getSpaceItem: MockSpyFunction;
  deleteSpaceItem: MockSpyFunction;
}

/**
 * Creates a mock DatalayerClient SDK instance with spy functions.
 */
export function createMockSDK(): MockSDK {
  const createSpy = (): MockSpyFunction => {
    const spy = new SpyFunction();
    const fn = ((...args: unknown[]) => spy.call(...args)) as MockSpyFunction;
    // Create getters so calls array stays in sync
    Object.defineProperty(fn, "calls", {
      get() {
        return spy.calls;
      },
    });
    fn.mockReturnValue = <T>(value: T) => {
      spy.mockReturnValue(value);
      return fn;
    };
    fn.mockResolvedValue = <T>(value: T) => {
      spy.mockResolvedValue(value);
      return fn;
    };
    fn.mockRejectedValue = (error: Error) => {
      spy.mockRejectedValue(error);
      return fn;
    };
    fn.reset = () => spy.reset();
    return fn;
  };

  return {
    // IAM methods (nested structure - legacy)
    iam: {
      getIdentity: createSpy(),
      validateToken: createSpy(),
      getAuthenticationUrl: createSpy(),
      exchangeCodeForToken: createSpy(),
    },
    // Runtime methods (nested structure - legacy)
    runtimes: {
      list: createSpy(),
      create: createSpy(),
      get: createSpy(),
      terminate: createSpy(),
      environments: createSpy(),
    },
    // Spacer methods (nested structure - legacy)
    spacer: {
      items: {
        getSpaceItems: createSpy(),
        createNotebook: createSpy(),
        createLexical: createSpy(),
        updateItem: createSpy(),
        deleteItem: createSpy(),
      },
      users: {
        getUserSpaces: createSpy(),
      },
    },
    // Flat SDK methods (actual DatalayerClient interface)
    whoami: createSpy(),
    login: createSpy(),
    logout: createSpy(),
    setToken: createSpy(),
    getToken: createSpy(),
    listEnvironments: createSpy(),
    ensureRuntime: createSpy(),
    createRuntime: createSpy(),
    listRuntimes: createSpy(),
    getRuntime: createSpy(),
    deleteRuntime: createSpy(),
    getMySpaces: createSpy(),
    createNotebook: createSpy(),
    getNotebook: createSpy(),
    updateNotebook: createSpy(),
    createLexical: createSpy(),
    getLexical: createSpy(),
    updateLexical: createSpy(),
    getSpaceItems: createSpy(),
    getSpaceItem: createSpy(),
    deleteSpaceItem: createSpy(),
  };
}

/**
 * Creates a mock VS Code OutputChannel for logging tests.
 */
export function createMockOutputChannel(
  name: string = "Test",
): vscode.OutputChannel {
  const lines: string[] = [];

  return {
    name,
    append: (value: string) => {
      lines.push(value);
    },
    appendLine: (value: string) => {
      lines.push(value + "\n");
    },
    clear: () => {
      lines.length = 0;
    },
    show: () => {},
    hide: () => {},
    dispose: () => {},
    replace: (value: string) => {
      lines.length = 0;
      lines.push(value);
    },
    // Helper to get logged content for assertions
    getContent: () => lines.join(""),
  } as unknown as vscode.OutputChannel;
}

/**
 * Creates a mock VS Code SecretStorage for testing.
 */
export function createMockSecretStorage(): vscode.SecretStorage {
  const secrets = new Map<string, string>();
  const onDidChangeEmitter =
    new vscode.EventEmitter<vscode.SecretStorageChangeEvent>();

  return {
    keys: async () => Array.from(secrets.keys()),
    get: async (key: string) => secrets.get(key),
    store: async (key: string, value: string) => {
      secrets.set(key, value);
      onDidChangeEmitter.fire({ key });
    },
    delete: async (key: string) => {
      secrets.delete(key);
      onDidChangeEmitter.fire({ key });
    },
    onDidChange: onDidChangeEmitter.event,
  };
}

/**
 * Creates a mock VS Code StatusBarItem for testing.
 */
export function createMockStatusBarItem(): vscode.StatusBarItem {
  return {
    text: "",
    tooltip: "",
    command: undefined,
    color: undefined,
    backgroundColor: undefined,
    alignment: vscode.StatusBarAlignment.Left,
    priority: 0,
    show: () => {},
    hide: () => {},
    dispose: () => {},
  } as unknown as vscode.StatusBarItem;
}

/**
 * Waits for a promise to resolve with proper error handling.
 * Useful for testing async operations.
 */
export async function waitFor<T>(
  fn: () => T | Promise<T>,
  options: { timeout?: number; interval?: number } = {},
): Promise<T> {
  const { timeout = 1000, interval = 50 } = options;
  const startTime = Date.now();

  while (Date.now() - startTime < timeout) {
    try {
      const result = await fn();
      if (result) {
        return result;
      }
    } catch (error) {
      // Continue waiting
    }
    await new Promise((resolve) => setTimeout(resolve, interval));
  }

  throw new Error(`waitFor timeout after ${timeout}ms`);
}

/**
 * Creates a spy that tracks all calls and allows assertions.
 */
export function createSpy<
  T extends (...args: unknown[]) => unknown,
>(): SpyFunction<ReturnType<T>> {
  return new SpyFunction<ReturnType<T>>();
}
