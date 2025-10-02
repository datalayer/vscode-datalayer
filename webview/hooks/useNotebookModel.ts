/*
 * Copyright (c) 2021-2025 Datalayer, Inc.
 *
 * MIT License
 */

/**
 * @module hooks/useNotebookModel
 * Manages notebook model lifecycle and dirty state tracking.
 */

import { useCallback, useRef } from "react";
import type { MessageHandler } from "../services/messageHandler";
import { saveToBytes } from "../utils";

export interface UseNotebookModelOptions {
  isDatalayerNotebook: boolean;
  messageHandler: MessageHandler;
}

// Type for JupyterLab notebook model with signals
interface INotebookModel {
  stateChanged?: {
    connect: (handler: (sender: unknown, args: unknown) => void) => void;
    disconnect: (handler: (sender: unknown, args: unknown) => void) => void;
  };
  contentChanged?: {
    connect: (handler: () => void) => void;
    disconnect: (handler: () => void) => void;
  };
  toJSON: () => unknown;
  dirty?: boolean;
}

/**
 * Hook to manage notebook model state and change tracking.
 *
 * Handles:
 * - Notebook model change tracking
 * - Content change notifications to extension
 * - Signal connection management
 *
 * @param options - Configuration options
 * @returns Notebook model state and handlers
 */
export function useNotebookModel({
  isDatalayerNotebook,
  messageHandler,
}: UseNotebookModelOptions) {
  const currentNotebookModel = useRef<unknown>(null);
  const lastSavedContent = useRef<Uint8Array | null>(null);
  const contentChangeHandler = useRef<
    ((sender: unknown, args: unknown) => void) | null
  >(null);

  /**
   * Handle notebook model changed event.
   * Sets up signal listeners for content changes (local notebooks only).
   */
  const handleNotebookModelChanged = useCallback(
    (notebookModel: unknown) => {
      // Only track changes for local notebooks (not Datalayer notebooks)
      if (!isDatalayerNotebook && notebookModel) {
        const model = notebookModel as INotebookModel;
        currentNotebookModel.current = model;

        // Disconnect any previous listeners
        if (contentChangeHandler.current) {
          try {
            const currentModel = currentNotebookModel.current as INotebookModel;
            if (currentModel?.stateChanged) {
              currentModel.stateChanged.disconnect(
                contentChangeHandler.current,
              );
            }
          } catch (e) {
            // Ignore if not connected
          }
        }

        // Try contentChanged signal first (more direct for content changes)
        let connectedSignal = false;

        if (model.contentChanged) {
          const handleContentChange = () => {
            try {
              const notebookData = model.toJSON();
              const bytes = saveToBytes(notebookData);

              // Notify the extension about the change
              messageHandler.send({
                type: "notebook-content-changed",
                body: { content: bytes },
              });
              lastSavedContent.current = bytes;
            } catch (error) {
              // Error handling content change
            }
          };

          contentChangeHandler.current = handleContentChange;
          model.contentChanged.connect(handleContentChange);
          connectedSignal = true;
        }

        // Fallback to stateChanged signal
        if (model.stateChanged && !connectedSignal) {
          const handleStateChange = (_sender: unknown, _args: unknown) => {
            try {
              const notebookData = model.toJSON();
              const bytes = saveToBytes(notebookData);

              // Only send if content actually changed
              if (
                !lastSavedContent.current ||
                bytes.length !== lastSavedContent.current.length ||
                !bytes.every((v, i) => v === lastSavedContent.current![i])
              ) {
                messageHandler.send({
                  type: "notebook-content-changed",
                  body: { content: bytes },
                });
                lastSavedContent.current = bytes;
              }
            } catch (error) {
              // Error handling state change
            }
          };

          contentChangeHandler.current = handleStateChange;
          model.stateChanged.connect(handleStateChange);
          connectedSignal = true;

          // Store initial content and check initial dirty state
          try {
            const initialData = model.toJSON();
            const initialBytes = saveToBytes(initialData);
            lastSavedContent.current = initialBytes;

            // If notebook is already dirty on load, notify extension
            if (model.dirty) {
              messageHandler.send({
                type: "notebook-content-changed",
                body: { content: initialBytes },
              });
            }
          } catch (error) {
            // Error storing initial content
          }
        }
      }
    },
    [isDatalayerNotebook, messageHandler],
  );

  /**
   * Get current notebook data for save operations
   */
  const getNotebookData = useCallback(
    (fallbackNbformat?: unknown): Uint8Array => {
      if (currentNotebookModel.current) {
        try {
          const model = currentNotebookModel.current as INotebookModel;
          const notebookData = model.toJSON();
          return saveToBytes(notebookData);
        } catch (error) {
          // Fallback to original nbformat
          return saveToBytes(fallbackNbformat || {});
        }
      }
      // Fallback if model not available yet
      return saveToBytes(fallbackNbformat || {});
    },
    [],
  );

  /**
   * Mark notebook as clean (after save)
   */
  const markClean = useCallback(() => {
    const model = currentNotebookModel.current as INotebookModel;
    if (model && model.dirty) {
      model.dirty = false;
    }
  }, []);

  return {
    notebookModel: currentNotebookModel.current,
    handleNotebookModelChanged,
    getNotebookData,
    markClean,
  };
}
