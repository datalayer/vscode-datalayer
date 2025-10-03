/*
 * Copyright (c) 2021-2025 Datalayer, Inc.
 *
 * MIT License
 */

/**
 * Document message router service.
 * Centralized message routing for document providers with handler registration pattern.
 *
 * @module services/messaging/messageRouter
 */

import { BaseService } from "../core/baseService";
import type { ILogger } from "../interfaces/ILogger";
import type { ExtensionMessage } from "../../types/vscode/messages";
import type {
  DocumentContext,
  MessageHandler,
  MessageHandlerMap,
} from "./types";

/**
 * Document message router service.
 * Provides centralized message routing with handler registration pattern.
 * Eliminates code duplication between NotebookProvider and LexicalProvider.
 *
 * @example
 * ```typescript
 * const router = new DocumentMessageRouter(logger);
 * await router.initialize();
 *
 * // Register handlers
 * router.registerHandler('select-runtime', async (msg, ctx) => {
 *   // Handle runtime selection
 * });
 *
 * // Route message
 * await router.routeMessage(message, context);
 * ```
 */
export class DocumentMessageRouter extends BaseService {
  private readonly handlers: MessageHandlerMap = new Map();

  constructor(logger: ILogger) {
    super("DocumentMessageRouter", logger);
  }

  /**
   * Registers a message handler for a specific message type.
   *
   * @param messageType - The message type to handle (e.g., 'select-runtime')
   * @param handler - The handler function to call
   * @throws Error if handler is already registered for this type
   */
  public registerHandler(messageType: string, handler: MessageHandler): void {
    if (this.handlers.has(messageType)) {
      this.logger.warn(
        `Handler for '${messageType}' already registered, overwriting`,
      );
    }

    this.handlers.set(messageType, handler);
    this.logger.debug(`Registered handler for message type: ${messageType}`);
  }

  /**
   * Routes a message to the appropriate handler.
   * If no handler is registered, logs a warning and continues.
   *
   * @param message - The message from the webview
   * @param context - The document context
   */
  public async routeMessage(
    message: ExtensionMessage,
    context: DocumentContext,
  ): Promise<void> {
    this.assertReady();

    const messageType = message.type;
    const handler = this.handlers.get(messageType);

    if (!handler) {
      this.logger.warn(
        `No handler registered for message type: ${messageType}`,
      );
      return;
    }

    try {
      this.logger.debug(
        `Routing message type: ${messageType} for document: ${context.documentUri}`,
      );
      await handler(message, context);
    } catch (error) {
      this.logger.error(
        `Error handling message type '${messageType}':`,
        error as Error,
      );
      // Re-throw so provider can handle if needed
      throw error;
    }
  }

  /**
   * Checks if a handler is registered for a message type.
   *
   * @param messageType - The message type to check
   * @returns True if a handler is registered
   */
  public hasHandler(messageType: string): boolean {
    return this.handlers.has(messageType);
  }

  /**
   * Unregisters a handler for a message type.
   *
   * @param messageType - The message type to unregister
   * @returns True if a handler was removed
   */
  public unregisterHandler(messageType: string): boolean {
    const removed = this.handlers.delete(messageType);
    if (removed) {
      this.logger.debug(
        `Unregistered handler for message type: ${messageType}`,
      );
    }
    return removed;
  }

  /**
   * Gets all registered message types.
   *
   * @returns Array of registered message types
   */
  public getRegisteredTypes(): string[] {
    return Array.from(this.handlers.keys());
  }

  /**
   * Initialization hook (no-op for this service).
   */
  protected async onInitialize(): Promise<void> {
    // No initialization needed for this service
    this.logger.info("DocumentMessageRouter initialized");
  }

  /**
   * Disposal hook - clears all handlers.
   */
  protected async onDispose(): Promise<void> {
    this.handlers.clear();
    this.logger.info("DocumentMessageRouter disposed");
  }
}
