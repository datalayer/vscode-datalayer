/*
 * Copyright (c) 2021-2025 Datalayer, Inc.
 *
 * MIT License
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * Minimal ServiceManager for Pyodide that makes ZERO HTTP requests
 * This is a complete reimplementation that doesn't inherit from ServiceManager
 */

import {
  ServerConnection,
  ServiceManager,
  Kernel,
  Session,
} from "@jupyterlab/services";
import { Signal, ISignal } from "@lumino/signaling";

// Import inline Pyodide kernel that uses Blob URL for Web Worker
import { PyodideInlineKernel } from "./pyodideInlineKernel";
import { BaseKernelManager, BaseSessionManager } from "./base";

/**
 * Minimal KernelManager that only supports starting Pyodide kernels.
 *
 * Extends BaseKernelManager to inherit common functionality while
 * providing Pyodide-specific implementation for kernel creation.
 *
 * @extends {BaseKernelManager}
 */
class MinimalKernelManager extends BaseKernelManager {
  readonly managerType = "pyodide" as const;

  /**
   * Reference to the active Pyodide kernel.
   */
  private _pyodideKernel: PyodideInlineKernel | null = null;

  constructor(serverSettings: ServerConnection.ISettings) {
    super(serverSettings);
  }

  /**
   * Start a new Pyodide kernel.
   * Creates inline kernel using Blob URL for Web Worker (bypasses CSP).
   *
   * @param options - Kernel creation options
   * @returns Promise resolving to Pyodide kernel connection
   */
  async startNew(
    options: Kernel.IKernelOptions = {},
  ): Promise<Kernel.IKernelConnection> {
    console.error(
      "🔵🔵🔵 [PyodideServiceManager] startNew() called - creating FULL kernel 🔵🔵🔵",
    );
    this.log("startNew called", options);

    // CRITICAL FIX: Reuse existing kernel instead of creating duplicates!
    // The notebook framework may call startNew() multiple times during initialization
    // BUT: Don't reuse if the kernel has been disposed!
    if (this._pyodideKernel && !this._pyodideKernel.isDisposed) {
      console.error(
        "🔵 [PyodideServiceManager] Reusing existing kernel:",
        this._pyodideKernel.id,
      );
      return this._pyodideKernel;
    }

    // If we had a disposed kernel, clear it
    if (this._pyodideKernel?.isDisposed) {
      console.error(
        "🔵 [PyodideServiceManager] Previous kernel was disposed, creating new one",
      );
      this._pyodideKernel = null;
      this._activeKernel = null;
    }

    // Create inline Pyodide kernel that uses Blob URL for Web Worker (bypasses CSP!)
    this._pyodideKernel = new PyodideInlineKernel(options, this.serverSettings);
    this._activeKernel = this._pyodideKernel;

    this._runningChanged.emit([this._pyodideKernel.model]);
    return this._pyodideKernel;
  }

  /**
   * Shut down specific Pyodide kernel.
   *
   * @param id - Kernel identifier
   */
  override async shutdown(id: string): Promise<void> {
    this.log(`shutdown called for kernel: ${id}`);

    if (this._pyodideKernel?.id === id) {
      this._pyodideKernel.dispose();
      this._pyodideKernel = null;
      this._activeKernel = null;
      this._runningChanged.emit([]);
    }
  }

  /**
   * Shut down all Pyodide kernels.
   */
  override async shutdownAll(): Promise<void> {
    this.log("shutdownAll called");

    if (this._pyodideKernel) {
      this._pyodideKernel.dispose();
      this._pyodideKernel = null;
      this._activeKernel = null;
      this._runningChanged.emit([]);
    }
  }

  /**
   * Dispose of kernel manager and all resources.
   */
  override dispose(): void {
    if (this._pyodideKernel) {
      this._pyodideKernel.dispose();
      this._pyodideKernel = null;
      this._activeKernel = null;
    }
    super.dispose();
  }
}

/**
 * Minimal SessionManager for Pyodide.
 *
 * Extends BaseSessionManager to inherit common functionality while
 * providing Pyodide-specific session creation (creates kernel + minimal session).
 *
 * @extends {BaseSessionManager}
 */
class MinimalSessionManager extends BaseSessionManager {
  readonly managerType = "pyodide" as const;

  /**
   * Create minimal session manager.
   *
   * @param _kernelManager - Minimal kernel manager for Pyodide
   * @param serverSettings - Jupyter server connection settings
   */
  constructor(
    private _kernelManager: MinimalKernelManager,
    serverSettings: ServerConnection.ISettings,
  ) {
    super(serverSettings);
  }

  /**
   * Start a new Pyodide session.
   * Creates kernel first, then wraps in minimal session connection.
   *
   * @param options - Session creation options
   * @returns Promise resolving to session connection
   */
  async startNew(
    options: Session.ISessionOptions,
  ): Promise<Session.ISessionConnection> {
    this.log("startNew called", options);

    // Create kernel
    const kernel = await this._kernelManager.startNew(options.kernel);

    // Create minimal session WITHOUT signals first (to avoid TDZ error)
    const session: Session.ISessionConnection = {
      id: `session-${Date.now()}`,
      name: options.name || "",
      path: options.path || "",
      type: options.type || "notebook",
      kernel,
      serverSettings: this.serverSettings,
      model: {
        id: `session-${Date.now()}`,
        name: options.name || "",
        path: options.path || "",
        type: options.type || "notebook",
        kernel: kernel.model,
      },
      disposed: null as any, // Will be set after
      kernelChanged: null as any, // Will be set after
      propertyChanged: null as any, // Will be set after
      statusChanged: null as any, // Will be set after
      connectionStatusChanged: null as any, // Will be set after
      iopubMessage: null as any, // Will be set after
      unhandledMessage: null as any, // Will be set after
      anyMessage: null as any, // Will be set after
      pendingInput: null as any, // Will be set after
      isDisposed: false,
      dispose: () => {},
      setPath: async (_path: string) => {},
      setName: async (_name: string) => {},
      setType: async (_type: string) => {},
      changeKernel: async (_options: any) => kernel,
      shutdown: async () => {},
    };

    // Now add signals AFTER session is created (avoids TDZ error)
    // Signals with readonly properties need to be added via Object.defineProperty
    Object.defineProperty(session, "disposed", {
      value: new Signal(session),
      writable: false,
    });
    session.kernelChanged = new Signal(session);
    Object.defineProperty(session, "propertyChanged", {
      value: new Signal(session),
      writable: false,
    });
    session.statusChanged = new Signal(session);
    session.connectionStatusChanged = new Signal(session);
    session.iopubMessage = new Signal(session);
    session.unhandledMessage = new Signal(session);
    session.anyMessage = new Signal(session);
    session.pendingInput = new Signal(session);

    this._activeSession = session;
    this._runningChanged.emit([session.model]);

    return session;
  }
}

/**
 * Minimal ServiceManager for Pyodide - NO HTTP REQUESTS
 *
 * @param pyodideUrl - Optional Pyodide CDN URL (default: official CDN)
 */
export function createPyodideServiceManager(
  pyodideUrl?: string,
): ServiceManager.IManager {
  console.log(
    "[PyodideServiceManager] createPyodideServiceManager called with URL:",
    pyodideUrl || "default CDN",
  );
  const serverSettings = ServerConnection.makeSettings({
    baseUrl: "http://pyodide-local",
    wsUrl: "ws://pyodide-local",
    token: "",
  });

  const kernelManager = new MinimalKernelManager(serverSettings);
  const sessionManager = new MinimalSessionManager(
    kernelManager,
    serverSettings,
  );

  // Create minimal user manager - CRITICAL: Notebook2 accesses user.userChanged!
  // The userManager object MUST exist BEFORE creating the Signal because Signal uses WeakMap
  // which requires an object (not null) as the key
  const userManager: any = {
    isDisposed: false,
    dispose: () => {},
    ready: Promise.resolve(),
    isReady: true,
    identity: undefined,
    permissions: undefined,
    refreshUser: () => Promise.resolve(),
  };

  // CRITICAL: Pass userManager itself as the signal sender (not null!)
  // Lumino Signal uses WeakMap internally which requires an object key
  userManager.userChanged = new Signal(userManager);

  // Create minimal events manager
  const eventsManager: any = {
    isDisposed: false,
    dispose: () => {},
    emit: () => Promise.resolve(),
  };

  // Pass eventsManager as sender for its stream signal
  eventsManager.stream = new Signal(eventsManager);

  // Create minimal contents manager - CRITICAL: Context calls contents.normalize()!
  // The contentsManager object MUST exist BEFORE creating the Signal
  const contentsManager: any = {
    isDisposed: false,
    dispose: () => {},
    ready: Promise.resolve(),
    isReady: true,
    normalize: (path: string) => path, // CRITICAL: Context.normalize() calls this!
    resolvePath: (path: string) => path,
    localPath: (path: string) => path,
    driveName: () => "",
    get: () => Promise.reject(new Error("Contents not available in Pyodide")),
    getDownloadUrl: () => Promise.resolve(""),
    newUntitled: () =>
      Promise.reject(new Error("Contents not available in Pyodide")),
    delete: () =>
      Promise.reject(new Error("Contents not available in Pyodide")),
    rename: () =>
      Promise.reject(new Error("Contents not available in Pyodide")),
    save: () => Promise.reject(new Error("Contents not available in Pyodide")),
    copy: () => Promise.reject(new Error("Contents not available in Pyodide")),
    createCheckpoint: () =>
      Promise.reject(new Error("Contents not available in Pyodide")),
    listCheckpoints: () => Promise.resolve([]),
    restoreCheckpoint: () =>
      Promise.reject(new Error("Contents not available in Pyodide")),
    deleteCheckpoint: () =>
      Promise.reject(new Error("Contents not available in Pyodide")),
    addDrive: () => {},
    getSharedModelFactory: () => undefined,
  };

  // Add fileChanged signal AFTER contentsManager is created
  contentsManager.fileChanged = new Signal(contentsManager);

  // Create minimal kernelspecs manager WITHOUT signal first
  const kernelspecsManager: any = {
    isDisposed: false,
    dispose: () => {},
    ready: Promise.resolve(),
    isReady: true,
    specs: {
      default: "pyodide",
      kernelspecs: {
        pyodide: {
          name: "pyodide",
          display_name: "Pyodide (Python)",
          language: "python",
          argv: [],
          metadata: {},
          resources: {},
        },
      },
    },
    refreshSpecs: () => Promise.resolve(),
    specsChanged: null as any, // Will be set after
  };

  // Add signal AFTER kernelspecsManager is created
  kernelspecsManager.specsChanged = new Signal(kernelspecsManager);

  // Create minimal service manager object
  const serviceManager: ServiceManager.IManager = {
    serverSettings,
    kernels: kernelManager as any,
    kernelspecs: kernelspecsManager as any, // CRITICAL: SessionContext needs kernelspecs.specs!
    sessions: sessionManager as any,
    contents: contentsManager as any, // CRITICAL: Context needs contents.normalize()!
    terminals: null as any, // Not needed
    events: eventsManager as any, // Minimal events
    settings: null as any, // Not needed
    nbconvert: null as any, // Not needed
    builder: null as any, // Not needed
    workspaces: null as any, // Not needed
    user: userManager as any, // CRITICAL: Notebook2 needs user.userChanged!
    get isReady() {
      return true;
    },
    get ready() {
      return Promise.resolve();
    },
    get connectionFailure(): ISignal<ServiceManager.IManager, Error> {
      return new Signal(serviceManager as any);
    },
    dispose: () => {
      console.log("[PyodideServiceManager] Disposing service manager");
      // CRITICAL: Shutdown all kernels when service manager is disposed
      kernelManager.shutdownAll().catch((error) => {
        console.error(
          "[PyodideServiceManager] Error shutting down kernels:",
          error,
        );
      });
      kernelManager.dispose();
    },
    get isDisposed() {
      return false;
    },
  };

  // Mark as Pyodide service manager
  (serviceManager as any)["__NAME__"] = "DirectPyodideServiceManager";

  return serviceManager;
}
