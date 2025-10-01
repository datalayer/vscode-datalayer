/*
 * Copyright (c) 2021-2025 Datalayer, Inc.
 *
 * MIT License
 */

/**
 * TypeScript interfaces for JupyterLab widget integration.
 * Provides proper typing for Lumino widget DOM attachments.
 *
 * @module webview/types/jupyterlab
 */

import type { Widget } from "@lumino/widgets";

/**
 * Base interface for DOM elements that have an attached Lumino widget.
 * JupyterLab attaches widget references directly to DOM elements.
 */
export interface ElementWithLuminoWidget extends Element {
  /** The attached Lumino widget instance */
  lumino_widget?: Widget;
}

/**
 * Type-safe cast for DOM elements that may have Lumino widgets.
 * Provides proper null checking and type safety.
 *
 * @param element - DOM element to check
 * @returns The element cast to ElementWithLuminoWidget or null if invalid
 */
export function asLuminoElement(
  element: Element | null,
): ElementWithLuminoWidget | null {
  if (!element) {
    return null;
  }
  return element as ElementWithLuminoWidget;
}

/**
 * Gets the Lumino widget from a DOM element with null safety.
 *
 * @param element - DOM element to extract widget from
 * @returns The Lumino widget instance or null if not found
 */
export function getLuminoWidget(element: Element | null): Widget | null {
  const luminoElement = asLuminoElement(element);
  return luminoElement?.lumino_widget || null;
}

/**
 * Interface for NotebookPanel-specific widgets.
 * NotebookPanel widgets have additional properties and methods.
 */
export interface NotebookPanelWidget extends Widget {
  /** The notebook content widget */
  content?: Widget;
}

/**
 * Gets a NotebookPanel widget from a DOM element with proper typing.
 *
 * @param element - DOM element to extract NotebookPanel from
 * @returns The NotebookPanel widget instance or null if not found
 */
export function getNotebookPanelWidget(
  element: Element | null,
): NotebookPanelWidget | null {
  const widget = getLuminoWidget(element);
  if (!widget) {
    return null;
  }

  // Check if this looks like a NotebookPanel (has content property)
  const hasContent = "content" in widget;
  return hasContent ? (widget as NotebookPanelWidget) : null;
}

/**
 * Finds the first NotebookPanel widget in the document.
 * Searches through all .jp-NotebookPanel elements.
 *
 * @returns The first NotebookPanel widget found or null
 */
export function findNotebookPanelWidget(): NotebookPanelWidget | null {
  const notebookPanels = document.querySelectorAll(".jp-NotebookPanel");

  for (const panel of notebookPanels) {
    const widget = getNotebookPanelWidget(panel);
    if (widget) {
      return widget;
    }
  }

  return null;
}

/**
 * Finds a NotebookPanel widget by container ID.
 *
 * @param containerId - ID of the container element
 * @returns The NotebookPanel widget found or null
 */
export function findNotebookPanelByContainerId(
  containerId: string,
): NotebookPanelWidget | null {
  const container = document.getElementById(containerId);
  if (!container) {
    return null;
  }

  const notebookPanel = container.querySelector(".jp-NotebookPanel");
  return getNotebookPanelWidget(notebookPanel);
}

/**
 * Multiple approaches to find a notebook widget for maximum compatibility.
 * Uses various DOM patterns that JupyterLab might use.
 *
 * @param notebookId - Optional notebook container ID
 * @returns The first notebook widget found or null
 */
export function findNotebookWidget(notebookId?: string): Widget | null {
  const approaches = [
    // 1. Look for NotebookPanel by container ID
    () => {
      if (!notebookId) {
        return null;
      }
      return findNotebookPanelByContainerId(notebookId);
    },

    // 2. Look for any NotebookPanel in DOM
    () => findNotebookPanelWidget(),

    // 3. Look for notebook widget through .jp-Notebook elements
    () => {
      const notebook = document.querySelector(".jp-Notebook");
      let widget = getLuminoWidget(notebook);

      if (!widget && notebook?.parentElement) {
        // Try parent element if direct lookup fails
        widget = getLuminoWidget(notebook.parentElement);
      }

      return widget;
    },
  ];

  for (const approach of approaches) {
    const result = approach();
    if (result) {
      return result;
    }
  }

  return null;
}
