/*
 * Copyright (c) 2021-2025 Datalayer, Inc.
 *
 * MIT License
 */

/**
 * @module hooks/useWindowResize
 * Manages window resize events with debouncing for notebook webview.
 */

import { useEffect } from "react";

/**
 * Hook to handle window resize events with debouncing.
 * Dispatches custom notebook-resize events to notebook panels.
 *
 * @param debounceMs - Debounce delay in milliseconds (default: 100ms)
 */
export function useWindowResize(debounceMs: number = 100) {
  useEffect(() => {
    let resizeTimeout: NodeJS.Timeout;

    const handleResize = () => {
      // Debounce resize events
      clearTimeout(resizeTimeout);
      resizeTimeout = setTimeout(() => {
        // Trigger a custom resize event that won't cause recursion
        const customResize = new CustomEvent("notebook-resize");
        window.dispatchEvent(customResize);

        // Try to find and update any notebook widgets directly
        const notebookPanels = document.querySelectorAll(".jp-NotebookPanel");
        notebookPanels.forEach((panel) => {
          const resizeEvent = new Event("resize");
          panel.dispatchEvent(resizeEvent);
        });
      }, debounceMs);
    };

    window.addEventListener("resize", handleResize);

    return () => {
      clearTimeout(resizeTimeout);
      window.removeEventListener("resize", handleResize);
    };
  }, [debounceMs]);
}
