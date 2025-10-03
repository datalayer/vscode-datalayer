/*
 * Copyright (c) 2021-2025 Datalayer, Inc.
 *
 * MIT License
 */

/**
 * Service that bridges network requests between webviews and the extension.
 * Handles HTTP requests and WebSocket lifecycle for both notebook and lexical providers.
 *
 * @module services/bridges/networkBridge
 */

import type * as vscode from "vscode";
import type { ExtensionMessage } from "../../types/vscode/messages";
import type { DocumentContext } from "../messaging/types";
import { BaseService } from "../core/baseService";
import { ServiceLoggers } from "../logging/loggers";
import { NotebookNetworkService } from "../network/networkProxy";

/**
 * Bridges network communication between webviews and the extension.
 * Encapsulates all HTTP and WebSocket handling logic shared by providers.
 */
export class NetworkBridgeService extends BaseService {
  private readonly _networkService: NotebookNetworkService;

  /**
   * Creates a new NetworkBridgeService instance.
   */
  constructor() {
    super(
      "NetworkBridgeService",
      ServiceLoggers.getLogger("NetworkBridgeService"),
    );
    this._networkService = new NotebookNetworkService();
  }

  /**
   * Initializes the network bridge service.
   * No-op for now as NotebookNetworkService doesn't require initialization.
   */
  protected async onInitialize(): Promise<void> {
    // No initialization needed
  }

  /**
   * Cleans up network service resources.
   */
  protected async onDispose(): Promise<void> {
    this._networkService.dispose();
  }

  /**
   * Registers network-related message handlers with the DocumentMessageRouter.
   *
   * @param router - The message router to register handlers with
   */
  public registerNetworkHandlers(router: {
    registerHandler: (
      type: string,
      handler: (
        message: ExtensionMessage,
        context: DocumentContext,
      ) => Promise<void>,
    ) => void;
  }): void {
    // HTTP request handler
    router.registerHandler("http-request", async (message, context) => {
      if (context.webviewPanel) {
        this._networkService.forwardRequest(
          message,
          context.webviewPanel as unknown as vscode.WebviewPanel,
        );
      }
    });

    // WebSocket open handler
    router.registerHandler("websocket-open", async (message, context) => {
      if (context.webviewPanel) {
        this._networkService.openWebsocket(
          message,
          context.webviewPanel as unknown as vscode.WebviewPanel,
        );
      }
    });

    // WebSocket message handler
    router.registerHandler("websocket-message", async (message) => {
      this._networkService.sendWebsocketMessage(message);
    });

    // WebSocket close handler
    router.registerHandler("websocket-close", async (message) => {
      this._networkService.closeWebsocket(message);
    });
  }
}
