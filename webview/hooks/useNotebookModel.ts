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
  const currentNotebookModel = useRef<any>(null);
  const lastSavedContent = useRef<Uint8Array | null>(null);
  const contentChangeHandler = useRef<
    ((sender: any, args: any) => void) | null
  >(null);

  /**
   * Handle notebook model changed event.
   * Sets up signal listeners for content changes (local notebooks only).
   */
  const handleNotebookModelChanged = useCallback(
    (notebookModel: any) => {
      // Only track changes for local notebooks (not Datalayer notebooks)
      if (!isDatalayerNotebook && notebookModel) {
        currentNotebookModel.current = notebookModel;

        // Disconnect any previous listeners
        if (contentChangeHandler.current) {
          try {
            if (currentNotebookModel.current?.stateChanged) {
              currentNotebookModel.current.stateChanged.disconnect(
                contentChangeHandler.current,
              );
            }
          } catch (e) {
            // Ignore if not connected
          }
        }

        // Try contentChanged signal first (more direct for content changes)
        let connectedSignal = false;

        if (notebookModel.contentChanged) {
          const handleContentChange = () => {
            try {
              const notebookData = notebookModel.toJSON();
              const bytes = saveToBytes(notebookData);

              // Notify the extension about the change
              messageHandler.postMessage({
                type: "notebook-content-changed",
                body: { content: bytes },
              });
              lastSavedContent.current = bytes;
            } catch (error) {
              // Error handling content change
            }
          };

          contentChangeHandler.current = handleContentChange;
          notebookModel.contentChanged.connect(handleContentChange);
          connectedSignal = true;
        }

        // Fallback to stateChanged signal
        if (notebookModel.stateChanged && !connectedSignal) {
          const handleStateChange = (_sender: any, _args: any) => {
            try {
              const notebookData = notebookModel.toJSON();
              const bytes = saveToBytes(notebookData);

              // Only send if content actually changed
              if (
                !lastSavedContent.current ||
                bytes.length !== lastSavedContent.current.length ||
                !bytes.every((v, i) => v === lastSavedContent.current![i])
              ) {
                messageHandler.postMessage({
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
          notebookModel.stateChanged.connect(handleStateChange);
          connectedSignal = true;

          // Store initial content and check initial dirty state
          try {
            const initialData = notebookModel.toJSON();
            const initialBytes = saveToBytes(initialData);
            lastSavedContent.current = initialBytes;

            // If notebook is already dirty on load, notify extension
            if (notebookModel.dirty) {
              messageHandler.postMessage({
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
  const getNotebookData = useCallback((fallbackNbformat?: any): Uint8Array => {
    if (currentNotebookModel.current) {
      try {
        const notebookData = currentNotebookModel.current.toJSON();
        return saveToBytes(notebookData);
      } catch (error) {
        // Fallback to original nbformat
        return saveToBytes(fallbackNbformat || {});
      }
    }
    // Fallback if model not available yet
    return saveToBytes(fallbackNbformat || {});
  }, []);

  /**
   * Mark notebook as clean (after save)
   */
  const markClean = useCallback(() => {
    if (currentNotebookModel.current && currentNotebookModel.current.dirty) {
      currentNotebookModel.current.dirty = false;
    }
  }, []);

  return {
    notebookModel: currentNotebookModel.current,
    handleNotebookModelChanged,
    getNotebookData,
    markClean,
  };
}
