/*
 * Copyright (c) 2021-2025 Datalayer, Inc.
 *
 * MIT License
 */

/**
 * @module hooks/useNotebookResize
 * Shared ResizeObserver hook for notebook editor.
 * Uses notebookStore2 to trigger Lumino widget updates.
 */

import { useEffect } from "react";
import { notebookStore2 } from "@datalayer/jupyter-react";

/**
 * Hook to set up ResizeObserver for notebook container.
 * Calls notebook.adapter.panel.update() when container resizes.
 *
 * @param notebookId - The notebook ID to update
 * @param containerRef - React ref to the container element
 */
export function useNotebookResize(
  notebookId: string,
  containerRef: React.RefObject<HTMLDivElement>,
) {
  useEffect(() => {
    const updateHeight = () => {
      if (containerRef.current) {
        const rect = containerRef.current.getBoundingClientRect();
        const newHeight = rect.height;

        if (newHeight > 0) {
          const notebookContainer = containerRef.current.querySelector(
            "#dla-Jupyter-Notebook",
          );
          const notebookBox =
            containerRef.current.querySelector(".dla-Box-Notebook");

          if (notebookContainer) {
            (notebookContainer as HTMLElement).style.height = `${newHeight}px`;
          }

          if (notebookBox) {
            (notebookBox as HTMLElement).style.height = `${newHeight}px`;
            (notebookBox as HTMLElement).style.maxHeight = `${newHeight}px`;
          }

          // Get notebook from store and update Lumino panel
          const notebook = notebookStore2.getState().notebooks.get(notebookId);
          if (notebook?.adapter?.panel) {
            notebook.adapter.panel.update();
          }
        }
      }
    };

    // Initial update after delay
    const initialTimer = setTimeout(updateHeight, 500);

    let resizeObserver: ResizeObserver | null = null;
    let debounceTimer: NodeJS.Timeout | null = null;

    // Set up ResizeObserver
    const setupObserver = setTimeout(() => {
      if (containerRef.current) {
        resizeObserver = new ResizeObserver((entries) => {
          if (debounceTimer) {
            clearTimeout(debounceTimer);
          }
          debounceTimer = setTimeout(() => {
            for (const entry of entries) {
              if (entry.contentRect.height > 0) {
                updateHeight();
              }
            }
          }, 50);
        });
        resizeObserver.observe(containerRef.current);
      }
    }, 600);

    // Also listen to window resize
    window.addEventListener("resize", updateHeight);

    return () => {
      clearTimeout(initialTimer);
      clearTimeout(setupObserver);
      if (debounceTimer) {
        clearTimeout(debounceTimer);
      }
      if (resizeObserver) {
        resizeObserver.disconnect();
      }
      window.removeEventListener("resize", updateHeight);
    };
  }, [notebookId, containerRef]);
}
