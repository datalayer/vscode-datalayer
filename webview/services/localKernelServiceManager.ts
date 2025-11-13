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

/**
 * Custom KernelManager for local kernels.
 * Provides kernel spec information and creates LocalKernelConnection.
 */
class LocalKernelManager implements Kernel.IManager {
  readonly managerType = "local" as const;
  private _kernelId: string;
  private _kernelName: string;
  private _serverSettings: ServerConnection.ISettings;
  private _activeKernel: Kernel.IKernelConnection | null = null;
  private _connectionFailure = new Signal<this, Error>(this);
  private _runningChanged = new Signal<this, Kernel.IModel[]>(this);

  constructor(
    kernelId: string,
    kernelName: string,
    serverSettings: ServerConnection.ISettings,
  ) {
    this._kernelId = kernelId;
    this._kernelName = kernelName;
    this._serverSettings = serverSettings;
  }

  get serverSettings(): ServerConnection.ISettings {
    return this._serverSettings;
  }

  get connectionFailure(): ISignal<this, Error> {
    return this._connectionFailure;
  }

  get isReady() {
    return true;
  }

  get ready() {
    return Promise.resolve();
  }

  get isDisposed() {
    return false;
  }

  get disposed(): ISignal<this, void> {
    return new Signal(this);
  }

  get runningChanged(): ISignal<this, Kernel.IModel[]> {
    return this._runningChanged;
  }

  get runningCount(): number {
    return this._activeKernel ? 1 : 0;
  }

  get isActive(): boolean {
    return true;
  }

  async findById(_id: string): Promise<Kernel.IModel | undefined> {
    if (this._activeKernel && this._activeKernel.id === _id) {
      return this._activeKernel.model;
    }
    return undefined;
  }

  dispose(): void {
    if (this._activeKernel) {
      this._activeKernel.dispose();
      this._activeKernel = null;
    }
  }

  async startNew(
    _options?: Partial<Pick<Kernel.IModel, "name">>,
    _connectOptions?: Omit<
      Kernel.IKernelConnection.IOptions,
      "model" | "serverSettings"
    >,
  ): Promise<Kernel.IKernelConnection> {
    console.log(`[LocalKernelManager] startNew called`);

    // Create LocalKernelConnection
    const kernelConnection = new LocalKernelConnection({
      id: this._kernelId,
      name: this._kernelName,
      model: {
        id: this._kernelId,
        name: this._kernelName,
      },
      serverSettings: this._serverSettings,
      clientId: UUID.uuid4(),
      username: "user",
      handleComms: true,
    });

    this._activeKernel = kernelConnection;
    console.log(`[LocalKernelManager] Created LocalKernelConnection`);

    return kernelConnection;
  }

  connectTo(
    _options: Kernel.IKernelConnection.IOptions,
  ): Kernel.IKernelConnection {
    console.log(`[LocalKernelManager] connectTo called (using startNew)`);
    // For local kernels, we just return the active kernel or create a new one
    if (this._activeKernel) {
      return this._activeKernel;
    }
    // This is a sync operation required by the interface, but we need to create async
    // We'll throw for now since this shouldn't be called in our local kernel flow
    throw new Error(
      "connectTo called without active kernel - use startNew instead",
    );
  }

  async shutdown(id: string): Promise<void> {
    console.log(`[LocalKernelManager] shutdown called for id: ${id}`);
    if (this._activeKernel && this._activeKernel.id === id) {
      await this._activeKernel.shutdown();
    }
  }

  async shutdownAll(): Promise<void> {
    console.log(`[LocalKernelManager] shutdownAll called`);
    if (this._activeKernel) {
      await this._activeKernel.shutdown();
    }
  }

  running(): IterableIterator<Kernel.IModel> {
    if (this._activeKernel) {
      return [this._activeKernel.model].values();
    }
    return [].values();
  }

  async refreshRunning(): Promise<void> {
    console.log(
      `[LocalKernelManager] refreshRunning called (no-op for local kernels)`,
    );
  }
}

/**
 * Custom SessionManager for local kernels.
 * Returns sessions with LocalKernelConnection instead of standard KernelConnection.
 */
class LocalSessionManager implements Session.IManager {
  readonly managerType = "local" as const;
  private _kernelId: string;
  private _kernelName: string;
  private _serverSettings: ServerConnection.ISettings;
  private _activeSession: Session.ISessionConnection | null = null;
  private _connectionFailure = new Signal<this, Error>(this);
  private _runningChanged = new Signal<this, Session.IModel[]>(this);

  constructor(
    kernelId: string,
    kernelName: string,
    serverSettings: ServerConnection.ISettings,
  ) {
    this._kernelId = kernelId;
    this._kernelName = kernelName;
    this._serverSettings = serverSettings;
  }

  // Required by IManager interface but not implemented for local kernels
  get serverSettings(): ServerConnection.ISettings {
    return this._serverSettings;
  }

  get connectionFailure(): ISignal<this, Error> {
    return this._connectionFailure;
  }

  get isReady() {
    return true;
  }

  get ready() {
    return Promise.resolve();
  }

  get isDisposed() {
    return false;
  }

  get runningChanged(): ISignal<this, Session.IModel[]> {
    return this._runningChanged;
  }

  async findById(_id: string): Promise<Session.IModel | undefined> {
    if (this._activeSession && this._activeSession.id === _id) {
      return this._activeSession as Session.IModel;
    }
    return undefined;
  }

  async findByPath(_path: string): Promise<Session.IModel | undefined> {
    if (this._activeSession && this._activeSession.path === _path) {
      return this._activeSession as Session.IModel;
    }
    return undefined;
  }

  dispose(): void {
    if (this._activeSession) {
      this._activeSession.dispose();
      this._activeSession = null;
    }
  }

  // Session management methods
  async startNew(
    options: Session.ISessionOptions,
    _connectOptions?: Omit<
      Kernel.IKernelConnection.IOptions,
      "model" | "serverSettings" | "connectToKernel"
    >,
  ): Promise<Session.ISessionConnection> {
    console.log(`[LocalSessionManager] startNew called with options:`, options);

    // Create LocalKernelConnection
    const kernelConnection = new LocalKernelConnection({
      id: this._kernelId,
      name: this._kernelName,
      model: {
        id: this._kernelId,
        name: this._kernelName,
      },
      serverSettings: this._serverSettings,
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

    // Create session connection
    // We need to create a minimal Session.ISessionConnection that wraps our LocalKernelConnection
    const sessionConnection: Session.ISessionConnection = {
      ...sessionModel,
      model: sessionModel,
      serverSettings: this._serverSettings,
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
        // For local kernels, we don't actually update the path
        // Just log and no-op
        console.log(`[LocalSessionManager] setPath called (no-op)`);
      },

      async setName(_name: string) {
        // For local kernels, we don't actually update the name
        console.log(`[LocalSessionManager] setName called (no-op)`);
      },

      async setType(_type: string) {
        // For local kernels, we don't actually update the type
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
    console.log(
      `[LocalSessionManager] Created session with LocalKernelConnection`,
    );

    return sessionConnection;
  }

  connectTo(
    _options: Omit<
      Kernel.IKernelConnection.IOptions,
      "serverSettings" | "connectToKernel"
    >,
  ): Session.ISessionConnection {
    console.log(`[LocalSessionManager] connectTo called`);
    // For local kernels, we just return the active session or throw
    if (this._activeSession) {
      return this._activeSession;
    }
    throw new Error(
      "connectTo called without active session - use startNew instead",
    );
  }

  async stopIfNeeded(_path: string): Promise<void> {
    console.log(`[LocalSessionManager] stopIfNeeded called (no-op)`);
  }

  async refreshRunning(): Promise<void> {
    console.log(
      `[LocalSessionManager] refreshRunning called (no-op for local kernels)`,
    );
  }

  async shutdown(id: string): Promise<void> {
    console.log(`[LocalSessionManager] shutdown called for id: ${id}`);
    if (this._activeSession && this._activeSession.id === id) {
      await this._activeSession.shutdown();
    }
  }

  async shutdownAll(): Promise<void> {
    console.log(`[LocalSessionManager] shutdownAll called`);
    if (this._activeSession) {
      await this._activeSession.shutdown();
    }
  }

  running(): IterableIterator<Session.IModel> {
    if (this._activeSession) {
      return [this._activeSession as Session.IModel].values();
    }
    return [].values();
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
  const serviceManager: ServiceManager.IManager & { managerType: "local" } = {
    managerType: "local" as const,
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
