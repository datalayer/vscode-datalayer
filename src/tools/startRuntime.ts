/*
 * Copyright (c) 2021-2025 Datalayer, Inc.
 *
 * MIT License
 */

/**
 * Embedded MCP Tool: Start Runtime
 *
 * Starts a new Datalayer runtime with default parameters.
 * This tool enables Copilot to start runtimes silently without user prompts.
 *
 * Example usage in Copilot:
 * "Start a runtime"
 * "Create a runtime for me"
 */

import * as vscode from "vscode";
import { getServiceContainer } from "../extension";

interface IStartRuntimeParameters {
  environment?: string;
  duration_minutes?: number;
}

/**
 * Tool for starting Datalayer runtimes with default parameters.
 * Implements VS Code's LanguageModelTool interface for Copilot integration.
 *
 * Creates runtime silently without user prompts, using:
 * - Default environment if not specified
 * - Default duration from settings (typically 10 minutes)
 */
export class StartRuntimeTool
  implements vscode.LanguageModelTool<IStartRuntimeParameters>
{
  /**
   * Prepares the tool invocation with user-facing messages.
   * Called before the tool executes to show confirmation dialog.
   */
  async prepareInvocation(
    options: vscode.LanguageModelToolInvocationPrepareOptions<IStartRuntimeParameters>,
    _token: vscode.CancellationToken,
  ) {
    const { environment, duration_minutes } = options.input;

    return {
      invocationMessage: `Starting runtime${environment ? ` with ${environment}` : ""}`,
      confirmationMessages: {
        title: "Start Datalayer Runtime",
        message: new vscode.MarkdownString(
          `Start a new runtime${environment ? ` with environment **${environment}**` : ""}${duration_minutes ? ` for ${duration_minutes} minutes` : ""}?`,
        ),
      },
    };
  }

  /**
   * Executes the tool - starts a runtime with default or specified parameters.
   * Returns runtime information for subsequent operations.
   */
  async invoke(
    options: vscode.LanguageModelToolInvocationOptions<IStartRuntimeParameters>,
    _token: vscode.CancellationToken,
  ) {
    try {
      // Get service container for SDK access
      const services = getServiceContainer();
      const sdk = services.sdk;
      const authProvider = services.authProvider;

      // Check authentication
      if (!authProvider.isAuthenticated()) {
        throw new Error("Not authenticated. Please login to Datalayer first.");
      }

      // Get environment from parameter or use first available
      let environmentName = options.input.environment;
      if (!environmentName) {
        const environments = await sdk.listEnvironments();
        if (!environments || environments.length === 0) {
          throw new Error("No environments available");
        }
        environmentName = environments[0].name;
      }

      // Get duration from parameter or use default from settings
      const duration =
        options.input.duration_minutes ||
        vscode.workspace
          .getConfiguration("datalayer.runtime")
          .get<number>("defaultMinutes", 10);

      // Start the runtime using SDK's ensureRuntime method
      const runtime = await sdk.ensureRuntime(environmentName, duration);

      if (!runtime) {
        throw new Error("Failed to create runtime");
      }

      return new vscode.LanguageModelToolResult([
        new vscode.LanguageModelTextPart(
          `Runtime started successfully!\n\n` +
            `Runtime Name: ${runtime.podName}\n` +
            `Environment: ${environmentName}\n` +
            `Duration: ${duration} minutes\n` +
            `Status: Running`,
        ),
      ]);
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      throw new Error(`Failed to start runtime: ${errorMessage}`);
    }
  }
}
