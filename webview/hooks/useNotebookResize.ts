/*
 * Copyright (c) 2021-2025 Datalayer, Inc.
 *
 * MIT License
 */

/**
 * @module hooks/useNotebookResize
 * Shared ResizeObserver hook for notebook editor.
 * Eliminates duplicate resize logic across components.
 */

import { useEffect } from "react";

/**
 * Hook to set up ResizeObserver for notebook element.
 * Dispatches custom 'notebook-resize' event when notebook size changes.
 *
 * This replaces duplicate code in NotebookEditor.tsx (lines 326-363 & 534-571)
 */
export function useNotebookResize() {
  useEffect(() => {
    let resizeObserver: ResizeObserver | null = null;
    let retryCount = 0;
    const maxRetries = 10;
    let timeoutId: NodeJS.Timeout;

    const setupNotebookResize = () => {
      const notebookElement = document.querySelector(".jp-Notebook");
      const notebookPanel = document.querySelector(".jp-NotebookPanel");

      if (notebookElement || notebookPanel) {
        // Found notebook element, set up observer
        resizeObserver = new ResizeObserver(() => {
          // Use custom event that won't trigger window resize handler
          const customResize = new CustomEvent("notebook-resize");
          window.dispatchEvent(customResize);
        });

        // Observe the parent element for size changes
        if (notebookPanel && notebookPanel.parentElement) {
          resizeObserver.observe(notebookPanel.parentElement);
        } else if (notebookElement && notebookElement.parentElement) {
          resizeObserver.observe(notebookElement.parentElement);
        }
      } else if (retryCount < maxRetries) {
        // Retry if elements not found yet
        retryCount++;
        timeoutId = setTimeout(setupNotebookResize, 200);
      }
    };

    // Start setup after a delay to allow DOM to render
    timeoutId = setTimeout(setupNotebookResize, 100);

    return () => {
      clearTimeout(timeoutId);
      if (resizeObserver) {
        resizeObserver.disconnect();
      }
    };
  }, []); // Empty dependency array - set up once on mount
}
