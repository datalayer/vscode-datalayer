/*
 * Copyright (c) 2021-2025 Datalayer, Inc.
 *
 * MIT License
 */

/**
 * Provider factory for creating VS Code Loro providers.
 * Implements the factory interface expected by LoroCollaborationPlugin.
 *
 * @module services/loro/providerFactory
 */

import { LoroDoc } from "loro-crdt";
import type { Provider } from "@datalayer/lexical-loro";
import { VSCodeLoroProvider } from "./vsCodeLoroProvider";

/**
 * Create a VS Code Loro provider.
 * This factory is used by LoroCollaborationPlugin to create collaboration providers.
 *
 * @param id - Document ID
 * @param docMap - Map of document ID to Loro document instances
 * @param websocketUrl - WebSocket URL (not used in VS Code, adapter ID used instead)
 * @returns Provider instance
 */
export function createVSCodeLoroProvider(
  id: string,
  docMap: Map<string, LoroDoc>,
  websocketUrl?: string,
): Provider {
  // Get or create doc from map (same pattern as wsProvider)
  let doc = docMap.get(id);
  if (!doc) {
    doc = new LoroDoc();
    docMap.set(id, doc);
  }

  // Generate unique adapter ID from document ID
  const adapterId = `loro-${id}`;

  // Get username and color from configuration or use defaults
  // These would typically come from the collaboration config
  const userName = "User"; // Will be set from lexicalStore
  const userColor = "#4CAF50"; // Will be set from lexicalStore

  return new VSCodeLoroProvider(
    adapterId,
    doc,
    userName,
    userColor,
    websocketUrl,
  );
}
