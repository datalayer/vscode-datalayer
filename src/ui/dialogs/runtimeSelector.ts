/*
 * Copyright (c) 2021-2023 Datalayer, Inc.
 *
 * MIT License
 */

/**
 * Runtime selection utility for notebook execution.
 * Provides UI for selecting existing runtimes or creating new ones.
 *
 * @module utils/runtimeSelector
 */

import * as vscode from "vscode";
import type { DatalayerClient } from "../../../../core/lib/client";
import type { Runtime } from "../../../../core/lib/client/models/Runtime";
import type { Environment } from "../../../../core/lib/client/models/Environment";
import type { IAuthProvider } from "../../services/interfaces/IAuthProvider";
import { EnvironmentCache } from "../../services/cache/environmentCache";
import { promptAndLogin } from "./authDialog";

/**
 * QuickPick item for runtime selection.
 */
interface RuntimeQuickPickItem extends vscode.QuickPickItem {
  runtime?: Runtime;
  action?: "create";
  environment?: Environment;
}

/**
 * Shows a QuickPick dialog for selecting or creating a Datalayer runtime.
 *
 * @param sdk - Datalayer SDK instance
 * @param authProvider - Authentication provider
 * @returns Selected or created runtime, or undefined if cancelled
 */
export async function selectDatalayerRuntime(
  sdk: DatalayerClient,
  authProvider: IAuthProvider,
): Promise<Runtime | undefined> {
  // Check authentication first
  if (!authProvider.isAuthenticated()) {
    await promptAndLogin("Runtime Selection");
    // Check again after login attempt
    if (!authProvider.isAuthenticated()) {
      return undefined;
    }
  }

  // Load runtimes and environments with progress
  const loadedData = await vscode.window.withProgress(
    {
      location: vscode.ProgressLocation.Notification,
      title: "Loading Datalayer runtimes...",
      cancellable: true,
    },
    async (progress, token) => {
      // Check for cancellation
      if (token.isCancellationRequested) {
        return null;
      }
      try {
        // Fetch existing runtimes
        const runtimes = await sdk.listRuntimes();

        // Get cached environments
        const environments =
          await EnvironmentCache.getInstance().getEnvironments(
            sdk,
            authProvider,
          );

        // Return the loaded data
        return { runtimes, environments };
      } catch (error) {
        vscode.window.showErrorMessage(`Failed to load runtimes: ${error}`);
        return null;
      }
    },
  );

  // Check if loading was cancelled or failed
  if (!loadedData) {
    return undefined;
  }

  const { runtimes, environments } = loadedData;

  // Now build QuickPick items outside of the progress dialog
  const items: RuntimeQuickPickItem[] = [];

  // Add existing runtimes (include all runtimes, not just "running" or "ready")
  // The SDK returns Runtime models now, not plain objects
  // Sort runtimes by most recent first using SDK getter
  const validRuntimes = runtimes.sort((a: Runtime, b: Runtime) => {
    const getStartTime = (runtime: Runtime) => {
      try {
        return runtime.startedAt ? runtime.startedAt.getTime() : 0;
      } catch (error) {
        return 0;
      }
    };

    return getStartTime(b) - getStartTime(a); // Most recent first
  });

  if (validRuntimes.length > 0) {
    for (const runtime of validRuntimes) {
      // Use the stable SDK interface instead of manual field extraction
      const runtimeData = runtime.toJSON();

      // Use SDK interface fields directly
      const displayName =
        runtimeData.givenName ??
        runtimeData.podName ??
        `Runtime ${runtimeData.uid.slice(0, 8)}`;
      const env =
        runtimeData.environmentTitle ??
        runtimeData.environmentName ??
        "unknown";
      const status = "ready";

      // Format start time using Runtime model getter
      let timeInfo = "";
      try {
        const startTime = runtime.startedAt;
        if (startTime) {
          const now = new Date();
          const diffMs = now.getTime() - startTime.getTime();
          const diffMins = Math.floor(diffMs / 60000);
          const diffHours = Math.floor(diffMins / 60);
          const diffDays = Math.floor(diffHours / 24);

          if (diffDays > 0) {
            timeInfo = ` • Started ${diffDays} day${
              diffDays > 1 ? "s" : ""
            } ago`;
          } else if (diffHours > 0) {
            timeInfo = ` • Started ${diffHours} hour${
              diffHours > 1 ? "s" : ""
            } ago`;
          } else if (diffMins > 0) {
            timeInfo = ` • Started ${diffMins} minute${
              diffMins > 1 ? "s" : ""
            } ago`;
          } else {
            timeInfo = ` • Just started`;
          }
        }
      } catch (error) {
        // Silently handle time formatting errors
      }

      // Add status indicator icon - all listed runtimes are assumed to be ready/running
      const statusIcon = "$(play)";

      items.push({
        label: `${statusIcon} ${displayName}`,
        description: env,
        detail: `Status: ${status}${timeInfo}`,
        runtime: runtime,
      });
    }

    // Add separator
    items.push({
      label: "Create New Runtime",
      kind: vscode.QuickPickItemKind.Separator,
    });
  }

  // Add create options for each environment
  for (const env of environments) {
    // Use the title from the environment to create a descriptive label
    // e.g., "AI Environment" -> "Create new AI Environment Runtime"
    // e.g., "Python CPU" -> "Create new Python CPU Runtime"
    const envTitle = env.title ?? env.name ?? "Unknown";
    const createLabel = `$(add) Create new ${envTitle} Runtime`;

    items.push({
      label: createLabel,
      description: env.name,
      detail: env.description ?? `Create a new ${envTitle} runtime`,
      action: "create",
      environment: env,
    });
  }

  // If no items available, show message
  if (
    items.length === 0 ||
    (items.length === 1 && items[0].kind === vscode.QuickPickItemKind.Separator)
  ) {
    vscode.window.showInformationMessage(
      "No runtimes or environments available",
    );
    return undefined;
  }

  // Show QuickPick (progress is now dismissed)

  const selected = await vscode.window.showQuickPick(items, {
    title: "Select Datalayer Runtime",
    placeHolder: "Choose an existing runtime or create a new one",
    ignoreFocusOut: true,
  });

  if (!selected) {
    return undefined;
  }

  // Handle selection
  if (selected.runtime) {
    // Use the Runtime object directly - no need for manual field extraction
    const runtime = selected.runtime;
    return runtime;
  } else if (selected.action === "create" && selected.environment) {
    // Create new runtime
    const result = await createRuntime(sdk, selected.environment);
    return result;
  }

  return undefined;
}

/**
 * Creates a new runtime with the specified environment.
 *
 * @param sdk - Datalayer SDK instance
 * @param environment - Environment to use
 * @returns Created runtime or undefined if failed
 */
async function createRuntime(
  sdk: DatalayerClient,
  environment: Environment,
): Promise<Runtime | undefined> {
  // Prompt for runtime name (human-readable)
  const name = await vscode.window.showInputBox({
    title: `Create ${environment.title ?? environment.name} Runtime`,
    prompt: "Enter a friendly name for the new runtime",
    placeHolder: `My ${environment.title ?? environment.name} Runtime`,
    validateInput: (value) => {
      if (!value || value.trim().length === 0) {
        return "Runtime name cannot be empty";
      }
      // Allow any human-readable name - the API will handle any restrictions
      return undefined;
    },
  });

  if (!name) {
    return undefined;
  }

  // Try to fetch user's available credits
  let availableCredits: number | undefined;
  let netAvailableCredits: number | undefined;
  let maxMinutes: number | undefined;
  let hasActiveRuntimes = false;

  try {
    const credits = await sdk.getCredits();

    // Use net available credits (accounts for existing reservations)
    availableCredits = credits.available;
    netAvailableCredits = credits.netAvailable;
    hasActiveRuntimes = credits.hasActiveRuntimes;

    // Check if environment has burning rate (use camelCase from SDK model)
    if (!environment.burningRate) {
      throw new Error(
        `Environment "${environment.name}" is missing the burningRate property from the API. ` +
          `This is required to calculate runtime credits. Please contact support.`,
      );
    }

    // Calculate max minutes based on net available credits using SDK utility
    maxMinutes = sdk.calculateMaxRuntimeMinutes(
      credits.netAvailable,
      environment.burningRate,
    );

    // Enforce 24-hour maximum (1440 minutes)
    if (maxMinutes !== undefined) {
      maxMinutes = Math.min(maxMinutes, 1440);
    } else {
      maxMinutes = 1440;
    }
  } catch (error) {
    // If credits API fails, still enforce 24-hour maximum
    maxMinutes = 1440;
  }

  // Get default runtime duration from settings (in minutes)
  const defaultMinutes = vscode.workspace
    .getConfiguration("datalayer.runtime")
    .get<number>("defaultMinutes", 10);
  const suggestedMinutes = maxMinutes
    ? Math.min(defaultMinutes, maxMinutes)
    : defaultMinutes;

  // Build the prompt message
  let promptMessage = "Enter the runtime duration in minutes (max 24 hours)";
  if (netAvailableCredits !== undefined && maxMinutes !== undefined) {
    const reservedInfo = hasActiveRuntimes
      ? " (after existing reservations)"
      : "";
    promptMessage = `You have ${netAvailableCredits.toFixed(
      1,
    )} credits available${reservedInfo}. Max ${maxMinutes} minutes for ${
      environment.name
    }`;
  }

  // Prompt for runtime duration in minutes
  const minutesInput = await vscode.window.showInputBox({
    title: `Set Runtime Duration for "${name}"`,
    prompt: promptMessage,
    placeHolder: maxMinutes
      ? `Minutes (max: ${maxMinutes})`
      : `Minutes (max: 1440)`,
    value: suggestedMinutes.toString(), // Pre-populate with suggested value
    validateInput: (value) => {
      if (!value || value.trim().length === 0) {
        return undefined; // Allow empty to use default
      }
      const num = Number(value);
      if (isNaN(num) || num <= 0) {
        return "Duration must be a positive number";
      }

      // Enforce 24-hour maximum
      if (num > 1440) {
        return "Maximum runtime duration is 24 hours (1440 minutes)";
      }

      // Check against credits-based maximum
      if (maxMinutes && num > maxMinutes) {
        if (netAvailableCredits !== undefined) {
          return `Maximum duration is ${maxMinutes} minutes with your available credits (${netAvailableCredits.toFixed(
            1,
          )} credits)`;
        } else {
          return `Maximum duration is ${maxMinutes} minutes`;
        }
      }
      return undefined;
    },
  });

  // Calculate credits limit from minutes
  let minutes: number;
  if (minutesInput === undefined) {
    // User pressed ESC - use suggested default
    minutes = suggestedMinutes;
  } else {
    minutes = minutesInput ? Number(minutesInput) : suggestedMinutes;
  }

  // Check if environment has burning rate (use camelCase from SDK model)
  if (!environment.burningRate) {
    throw new Error(
      `Environment "${environment.name}" is missing the burningRate property from the API. ` +
        `This is required to calculate runtime credits. Please contact support.`,
    );
  }

  // Calculate credits needed based on burning rate using SDK utility
  const creditsLimit = sdk.calculateCreditsRequired(
    minutes,
    environment.burningRate,
  );

  // Create runtime with progress
  return vscode.window.withProgress(
    {
      location: vscode.ProgressLocation.Notification,
      title: `Creating runtime "${name}"...`,
      cancellable: false,
    },
    async (progress) => {
      try {
        progress.report({
          increment: 0,
          message: "Requesting runtime creation...",
        });

        // Create the runtime

        // Check if SDK has createRuntime method
        if (typeof sdk.createRuntime !== "function") {
          throw new Error("SDK does not have createRuntime method");
        }

        const runtime = await sdk.createRuntime(
          environment.name,
          "notebook",
          name,
          creditsLimit,
        );

        progress.report({
          increment: 25,
          message: "Runtime created successfully!",
        });

        // Wait for the runtime to be ready with connection info
        progress.report({
          increment: 25,
          message: "Waiting for runtime to be ready...",
        });

        let attempts = 0;
        const maxAttempts = 20; // 20 seconds max wait
        let readyRuntime = null;

        while (attempts < maxAttempts) {
          await new Promise((resolve) => setTimeout(resolve, 1000));

          // Fetch the updated runtime list
          const runtimes = await sdk.listRuntimes();
          readyRuntime = runtimes.find((r: Runtime) => r.uid === runtime.uid);

          // Check if runtime has connection info
          if (readyRuntime && readyRuntime.ingress) {
            break;
          }

          attempts++;
          progress.report({
            increment: 2,
            message: `Waiting for runtime... (${attempts}s)`,
          });
        }

        // Complete the progress to 100%
        progress.report({
          increment: 100 - 50 - attempts * 2,
          message: "Complete!",
        });

        if (readyRuntime) {
          vscode.window.showInformationMessage(
            `Runtime "${name}" created and ready!`,
          );
          return readyRuntime;
        }

        // If we still don't have connection info, return what we have
        vscode.window.showInformationMessage(
          `Runtime "${name}" created but still initializing`,
        );
        return runtime;
      } catch (error) {
        vscode.window.showErrorMessage(`Failed to create runtime: ${error}`);
        return undefined;
      }
    },
  );
}

/**
 * Legacy function for backward compatibility.
 * Shows input box for manual Jupyter server URL entry.
 *
 * @deprecated Use selectDatalayerRuntime instead
 * @returns The validated server URL or undefined if cancelled
 */
export async function setRuntime(): Promise<string | undefined> {
  return vscode.window.showInputBox({
    title: "Select Runtime",
    placeHolder: "URL to a Jupyter Server",
    validateInput: async (text) => {
      if (!text) {
        return null;
      }
      try {
        const url = new URL(text);
        url.pathname = url.pathname.replace(/\/?$/, "") + "/api/";
        await fetch(url);
        return null;
      } catch (reason) {
        return {
          message: "Invalid Jupyter Server URL",
          severity: vscode.InputBoxValidationSeverity.Error,
        };
      }
    },
  });
}
