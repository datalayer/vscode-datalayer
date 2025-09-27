/*
 * Copyright (c) 2021-2023 Datalayer, Inc.
 *
 * MIT License
 */

/**
 * Runtime selection utility for notebook execution.
 * Provides UI for selecting and configuring Jupyter runtime environments.
 *
 * @module utils/runtimeSelector
 */

import { window, InputBoxValidationSeverity } from "vscode";

/**
 * Prompts user to enter a Jupyter Server URL.
 * Validates the URL by attempting to connect to the server's API endpoint.
 *
 * @returns The validated server URL or undefined if cancelled
 */
export async function setRuntime(): Promise<string | undefined> {
  return window.showInputBox({
    title: "Select Runtime",
    placeHolder: "URL to a Jupyter Server",
    validateInput: async (text) => {
      if (!text) {
        // Ignore empty text
        return null;
      }
      try {
        const url = new URL(text);
        url.pathname = url.pathname.replace(/\/?$/, "") + "/api/";
        await fetch(url);
        return null;
      } catch (reason) {
        console.error("Invalid URL provided: ", reason);
        return {
          message: "Invalid Jupyter Server URL",
          severity: InputBoxValidationSeverity.Error,
        };
      }
    },
  });
}
