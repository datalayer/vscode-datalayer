/*
 * Copyright (c) 2021-2025 Datalayer, Inc.
 *
 * MIT License
 */

/**
 * Custom ServiceManager for local kernels that returns LocalKernelConnection
 * instead of going through the standard Jupyter server session flow.
 *
 * This bypasses the HTTP/WebSocket API entirely and provides a pre-connected
 * kernel directly to JupyterLab components.
 *
 * @module localKernelServiceManager
 */

import {
  ServiceManager,
  Session,
  Kernel,
  ServerConnection,
  KernelMessage,
} from "@jupyterlab/services";
import {
  serialize,
  deserialize,
} from "@jupyterlab/services/lib/kernel/serialize";
import { ISignal, Signal } from "@lumino/signaling";
import { LocalKernelConnection } from "./localKernelConnection";
import { UUID } from "@lumino/coreutils";
import { BaseKernelManager, BaseSessionManager } from "./base";

/**
 * Custom KernelManager for local kernels.
 * Extends BaseKernelManager to eliminate ~200 lines of duplicate code.
 */
class LocalKernelManager extends BaseKernelManager {
  readonly managerType = "local" as const;

  constructor(
    private _kernelId: string,
    private _kernelName: string,
    serverSettings: ServerConnection.ISettings,
  ) {
    super(serverSettings);
  }

  /**
   * Start a new local kernel connection.
   * Creates LocalKernelConnection with direct ZMQ communication to VS Code.
   */
  async startNew(
    _options?: Partial<Pick<Kernel.IModel, "name">>,
    _connectOptions?: Omit<
      Kernel.IKernelConnection.IOptions,
      "model" | "serverSettings"
    >,
  ): Promise<Kernel.IKernelConnection> {
    this.log("startNew called");

    // Create LocalKernelConnection
    const kernelConnection = new LocalKernelConnection({
      id: this._kernelId,
      name: this._kernelName,
      model: {
        id: this._kernelId,
        name: this._kernelName,
      },
      serverSettings: this.serverSettings,
      clientId: UUID.uuid4(),
      username: "user",
      handleComms: true,
    });

    this._activeKernel = kernelConnection;
    this._runningChanged.emit([kernelConnection.model]);
    this.log("Created LocalKernelConnection");

    return kernelConnection;
  }

  /**
   * Connect to existing kernel.
   * For local kernels, returns active kernel or throws.
   */
  override connectTo(
    _options: Kernel.IKernelConnection.IOptions,
  ): Kernel.IKernelConnection {
    this.log("connectTo called");
    if (this._activeKernel) {
      return this._activeKernel;
    }
    throw new Error(
      "connectTo called without active kernel - use startNew instead",
    );
  }
}

/**
 * Custom SessionManager for local kernels.
 * Extends BaseSessionManager to eliminate duplicate code.
 * Returns sessions with LocalKernelConnection instead of standard KernelConnection.
 */
class LocalSessionManager extends BaseSessionManager {
  readonly managerType = "local" as const;

  constructor(
    private _kernelId: string,
    private _kernelName: string,
    serverSettings: ServerConnection.ISettings,
  ) {
    super(serverSettings);
  }

  /**
   * Start a new local session with LocalKernelConnection.
   * Creates a session that wraps our direct ZMQ kernel connection.
   */
  async startNew(
    options: Session.ISessionOptions,
    _connectOptions?: Omit<
      Kernel.IKernelConnection.IOptions,
      "model" | "serverSettings" | "connectToKernel"
    >,
  ): Promise<Session.ISessionConnection> {
    this.log("startNew called", options);

    // Create LocalKernelConnection
    const kernelConnection = new LocalKernelConnection({
      id: this._kernelId,
      name: this._kernelName,
      model: {
        id: this._kernelId,
        name: this._kernelName,
      },
      serverSettings: this.serverSettings,
      clientId: UUID.uuid4(),
      username: "user",
      handleComms: true,
    });

    // Create session model
    const sessionModel: Session.IModel = {
      id: UUID.uuid4(),
      name: options.name || "",
      path: options.path || "",
      type: options.type || "notebook",
      kernel: kernelConnection.model,
    };

    // Create session connection wrapping LocalKernelConnection
    const sessionConnection: Session.ISessionConnection = {
      ...sessionModel,
      model: sessionModel,
      serverSettings: this.serverSettings,
      isDisposed: false,
      disposed: kernelConnection.disposed as unknown as ISignal<
        Session.ISessionConnection,
        void
      >,
      kernel: kernelConnection,
      propertyChanged: kernelConnection.propertyChanged as unknown as ISignal<
        Session.ISessionConnection,
        "path" | "name" | "type"
      >,
      kernelChanged: kernelConnection.statusChanged as unknown as ISignal<
        Session.ISessionConnection,
        Session.ISessionConnection.IKernelChangedArgs
      >,
      statusChanged: kernelConnection.statusChanged as unknown as ISignal<
        Session.ISessionConnection,
        Kernel.Status
      >,
      connectionStatusChanged:
        kernelConnection.connectionStatusChanged as unknown as ISignal<
          Session.ISessionConnection,
          Kernel.ConnectionStatus
        >,
      iopubMessage: kernelConnection.iopubMessage as unknown as ISignal<
        Session.ISessionConnection,
        KernelMessage.IIOPubMessage
      >,
      unhandledMessage: kernelConnection.unhandledMessage as unknown as ISignal<
        Session.ISessionConnection,
        KernelMessage.IMessage
      >,
      anyMessage: kernelConnection.anyMessage as unknown as ISignal<
        Session.ISessionConnection,
        Kernel.IAnyMessageArgs
      >,
      pendingInput: kernelConnection.pendingInput as unknown as ISignal<
        Session.ISessionConnection,
        boolean
      >,

      dispose() {
        kernelConnection.dispose();
      },

      async setPath(_path: string) {
        console.log(`[LocalSessionManager] setPath called (no-op)`);
      },

      async setName(_name: string) {
        console.log(`[LocalSessionManager] setName called (no-op)`);
      },

      async setType(_type: string) {
        console.log(`[LocalSessionManager] setType called (no-op)`);
      },

      async changeKernel(_options: Partial<Kernel.IModel>) {
        console.log(
          `[LocalSessionManager] changeKernel called (not implemented for local kernels)`,
        );
        return kernelConnection;
      },

      async shutdown() {
        await kernelConnection.shutdown();
      },
    };

    this._activeSession = sessionConnection;
    this._runningChanged.emit([sessionConnection.model]);
    this.log("Created session with LocalKernelConnection");

    return sessionConnection;
  }
}

/**
 * Create a minimal ServiceManager for local kernels.
 * This service manager returns LocalKernelConnection when sessions are created,
 * bypassing the standard Jupyter server HTTP/WebSocket flow.
 */
export function createLocalKernelServiceManager(
  kernelId: string,
  kernelName: string,
  url: string,
): ServiceManager.IManager {
  const serverSettings: ServerConnection.ISettings = {
    baseUrl: url,
    wsUrl: url.replace("http", "ws"),
    token: "",
    appUrl: url,
    init: {},
    appendToken: false,
    fetch: fetch.bind(window),
    Headers: Headers,
    Request: Request,
    WebSocket: WebSocket,
    serializer: { serialize, deserialize },
  };

  const kernelManager = new LocalKernelManager(
    kernelId,
    kernelName,
    serverSettings,
  );
  const sessionManager = new LocalSessionManager(
    kernelId,
    kernelName,
    serverSettings,
  );

  // Create minimal contents manager with required methods
  const contentsManager = {
    driveName(_path: string): string {
      return "";
    },
    localPath(path: string): string {
      return path;
    },
  };

  // Create minimal service manager
  // We need to implement both kernels and sessions managers
  const serviceManager: ServiceManager.IManager = {
    kernels: kernelManager as unknown as Kernel.IManager,
    sessions: sessionManager as unknown as Session.IManager,
    contents: contentsManager as unknown as ServiceManager.IManager["contents"],
    serverSettings,
    isReady: true,
    ready: Promise.resolve(),
    isDisposed: false,

    // Mock implementations for other required properties
    connectionFailure: new Signal<ServiceManager.IManager, Error>(
      {} as ServiceManager.IManager,
    ) as unknown as ServiceManager.IManager["connectionFailure"],
    builder: {} as unknown as ServiceManager.IManager["builder"],
    kernelspecs: {} as unknown as ServiceManager.IManager["kernelspecs"],
    user: {} as unknown as ServiceManager.IManager["user"],
    workspaces: {} as unknown as ServiceManager.IManager["workspaces"],
    terminals: {} as unknown as ServiceManager.IManager["terminals"],
    events: {} as unknown as ServiceManager.IManager["events"],
    settings: {} as unknown as ServiceManager.IManager["settings"],
    nbconvert: {} as unknown as ServiceManager.IManager["nbconvert"],

    dispose() {
      kernelManager.dispose();
      sessionManager.dispose();
    },
  };

  return serviceManager;
}
