/*
 * Copyright (c) 2021-2025 Datalayer, Inc.
 *
 * MIT License
 */

/**
 * Service initialization factory for the Datalayer VS Code extension.
 * Configures and initializes all core services with proper dependency injection.
 *
 * @module services/serviceFactory
 */

import * as vscode from "vscode";
import { createVSCodeSDK, setSDKInstance } from "./sdkAdapter";
import { SDKAuthProvider } from "./authProvider";
import { SDKRuntimeService } from "./runtimeService";
import { SDKSpacerService } from "./spacerService";
import { DocumentBridge } from "./documentBridge";
import { DatalayerFileSystemProvider } from "../providers/documentsFileSystemProvider";

/**
 * Container for all extension services.
 * Provides typed access to initialized service instances.
 */
export interface ExtensionServices {
  /** Datalayer SDK instance */
  sdk: any;
  /** Authentication provider service */
  authProvider: SDKAuthProvider;
  /** Runtime management service */
  runtimeService: SDKRuntimeService;
  /** Space and document service */
  spacerService: SDKSpacerService;
  /** Document bridge service */
  documentBridge: DocumentBridge;
  /** Virtual file system provider */
  fileSystemProvider: DatalayerFileSystemProvider;
}

/**
 * Initializes all services required by the extension.
 * Sets up SDK, authentication, file system provider, and service dependencies.
 *
 * @param context - VS Code extension context
 * @returns Promise resolving to initialized service container
 *
 * @example
 * ```typescript
 * export async function activate(context: vscode.ExtensionContext) {
 *   const services = await initializeServices(context);
 *   // Services are ready for use
 * }
 * ```
 */
export async function initializeServices(
  context: vscode.ExtensionContext
): Promise<ExtensionServices> {
  const sdk = createVSCodeSDK({ context });
  setSDKInstance(sdk);

  const authProvider = SDKAuthProvider.getInstance(sdk, context);
  const runtimeService = SDKRuntimeService.getInstance(sdk, context);
  const spacerService = SDKSpacerService.getInstance();
  const documentBridge = DocumentBridge.getInstance(context, runtimeService);
  const fileSystemProvider = DatalayerFileSystemProvider.getInstance();

  try {
    await authProvider.initialize();
  } catch (error) {
    console.log(
      "[Extension] No existing authentication found:",
      error instanceof Error ? error.message : String(error)
    );
  }

  context.subscriptions.push(
    vscode.workspace.registerFileSystemProvider(
      "datalayer",
      fileSystemProvider,
      {
        isCaseSensitive: true,
        isReadonly: false,
      }
    )
  );

  context.subscriptions.push({
    dispose: () => {
      documentBridge.dispose();
    },
  });

  return {
    sdk,
    authProvider,
    runtimeService,
    spacerService,
    documentBridge,
    fileSystemProvider,
  };
}
