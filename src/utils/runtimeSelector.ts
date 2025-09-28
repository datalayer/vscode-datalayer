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
import type {
  DatalayerSDK,
  Runtime,
  Environment,
} from "../../../core/lib/index.js";
import { SDKAuthProvider } from "../services/authProvider";
import { EnvironmentCache } from "../services/environmentCache";

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
  sdk: DatalayerSDK,
  authProvider: SDKAuthProvider
): Promise<Runtime | undefined> {
  // Check authentication first
  if (!authProvider.isAuthenticated()) {
    vscode.window.showErrorMessage("Please login to Datalayer first");
    return undefined;
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
        const runtimes = await (sdk as any).listRuntimes();
        console.log("[RuntimeSelector] Found", runtimes.length, "runtimes");

        // Log the first runtime to see what fields are available
        if (runtimes.length > 0) {
          const firstRuntime = runtimes[0];
          // Check if it's a Runtime model or plain object
          const isModel =
            firstRuntime && typeof firstRuntime.toJSON === "function";
          console.log("[RuntimeSelector] First runtime is a model:", isModel);

          if (isModel) {
            const data = firstRuntime.toJSON();
            console.log(
              "[RuntimeSelector] First runtime data from toJSON():",
              data
            );
          } else {
            console.log(
              "[RuntimeSelector] First runtime raw object:",
              firstRuntime
            );
          }
        }

        // Get cached environments
        const environments =
          await EnvironmentCache.getInstance().getEnvironments(sdk);
        console.log(
          "[RuntimeSelector] Found",
          environments.length,
          "environments"
        );

        // Log each environment for debugging
        environments.forEach((env, index) => {
          console.log(`[RuntimeSelector] Environment ${index}:`, {
            name: env.name,
            title: (env as any).title || env.name,
            description: (env as any).description,
            uid: (env as any).uid || env.name,
          });
        });

        // Return the loaded data
        return { runtimes, environments };
      } catch (error) {
        console.error("[RuntimeSelector] Error loading runtimes:", error);
        vscode.window.showErrorMessage(`Failed to load runtimes: ${error}`);
        return null;
      }
    }
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
  // Sort runtimes by most recent first
  const validRuntimes = runtimes.sort((a: any, b: any) => {
    const getStartTime = (runtime: any) => {
      let runtimeData: any;
      if (runtime && typeof runtime === "object") {
        if ("startedAt" in runtime) {
          return runtime.startedAt ? new Date(runtime.startedAt).getTime() : 0;
        } else if (typeof runtime.toJSON === "function") {
          runtimeData = runtime.toJSON();
          return runtimeData?.started_at
            ? new Date(runtimeData.started_at).getTime()
            : 0;
        } else {
          return runtime.started_at
            ? new Date(runtime.started_at).getTime()
            : 0;
        }
      }
      return 0;
    };

    return getStartTime(b) - getStartTime(a); // Most recent first
  });

  if (validRuntimes.length > 0) {
    for (const runtime of validRuntimes) {
      // The SDK returns Runtime models with properties
      // Try to get data through model properties first
      let runtimeData: any;

      // Check if it's a Runtime model with properties
      if (runtime && typeof runtime === "object") {
        // Try accessing model properties directly
        if (
          "givenName" in runtime ||
          "podName" in runtime ||
          "uid" in runtime
        ) {
          // It's a Runtime model with getters
          runtimeData = {
            given_name: runtime.givenName || runtime.given_name,
            pod_name: runtime.podName || runtime.pod_name,
            uid: runtime.uid,
            environment_name:
              runtime.environmentName || runtime.environment_name,
            environment_title: runtime.environment_title,
            status: runtime.state || runtime.status || "ready",
            started_at: runtime.startedAt || runtime.started_at,
            ingress:
              runtime.jupyterUrl || runtime.ingress || runtime.jupyter_url,
            token:
              runtime.jupyterToken || runtime.token || runtime.jupyter_token,
          };
        } else if (typeof runtime.toJSON === "function") {
          // It has a toJSON method, use it
          runtimeData = runtime.toJSON();
        } else {
          // It's a plain object
          runtimeData = runtime;
        }
      } else {
        // Fallback to treating as plain object
        runtimeData = runtime;
      }

      // Prefer given_name over everything else, show it prominently
      const displayName =
        runtimeData.given_name ||
        runtimeData.pod_name ||
        (runtimeData.uid
          ? `Runtime ${runtimeData.uid.slice(0, 8)}`
          : "Unknown Runtime");

      // Show the environment title if available, otherwise fall back to name
      // The environment_title should match what we show in create options
      const env =
        runtimeData.environment_title ||
        runtimeData.environment_name ||
        "unknown";
      const status = runtimeData.status || runtimeData.state || "ready";

      // Format start time if available
      let timeInfo = "";
      if (runtimeData.started_at) {
        // Convert Unix timestamp (in seconds) to milliseconds for Date constructor
        const timestamp =
          typeof runtimeData.started_at === "number"
            ? runtimeData.started_at * 1000 // Unix timestamp in seconds
            : new Date(runtimeData.started_at).getTime(); // ISO string

        const startTime = new Date(timestamp);
        const now = new Date();
        const diffMs = now.getTime() - startTime.getTime();
        const diffMins = Math.floor(diffMs / 60000);
        const diffHours = Math.floor(diffMins / 60);
        const diffDays = Math.floor(diffHours / 24);

        if (diffDays > 0) {
          timeInfo = ` • Started ${diffDays} day${diffDays > 1 ? "s" : ""} ago`;
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

      // Add status indicator icon
      const statusIcon =
        status === "running"
          ? "$(play)"
          : status === "stopped"
          ? "$(stop)"
          : "$(clock)";

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
  console.log(
    "[RuntimeSelector] Adding create options for",
    environments.length,
    "environments"
  );
  for (const env of environments) {
    // Use the title from the environment to create a descriptive label
    // e.g., "AI Environment" -> "Create new AI Environment Runtime"
    // e.g., "Python CPU" -> "Create new Python CPU Runtime"
    const envTitle = env.title || env.name || "Unknown";
    const createLabel = `$(add) Create new ${envTitle} Runtime`;

    console.log("[RuntimeSelector] Adding create option:", {
      envTitle,
      envName: env.name,
      envDescription: env.description,
    });

    items.push({
      label: createLabel,
      description: env.name,
      detail: env.description || `Create a new ${envTitle} runtime`,
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
      "No runtimes or environments available"
    );
    return undefined;
  }

  // Show QuickPick (progress is now dismissed)
  console.log(
    "[RuntimeSelector] About to show QuickPick with",
    items.length,
    "items"
  );
  console.log(
    "[RuntimeSelector] QuickPick items:",
    items.map((item) => ({
      label: item.label,
      action: item.action,
      hasRuntime: !!item.runtime,
      hasEnvironment: !!item.environment,
      environmentName: item.environment?.name,
    }))
  );

  const selected = await vscode.window.showQuickPick(items, {
    title: "Select Datalayer Runtime",
    placeHolder: "Choose an existing runtime or create a new one",
    ignoreFocusOut: true,
  });

  console.log(
    "[RuntimeSelector] User selected item:",
    selected
      ? {
          label: selected.label,
          action: selected.action,
          hasRuntime: !!selected.runtime,
          hasEnvironment: !!selected.environment,
          environmentName: selected.environment?.name,
        }
      : "null (cancelled)"
  );

  if (!selected) {
    return undefined;
  }

  // Handle selection
  console.log("[RuntimeSelector] Processing selection...");
  if (selected.runtime) {
    console.log("[RuntimeSelector] User selected existing runtime");
    // Existing runtime selected
    const runtime = selected.runtime;

    // Get UID and other properties from Runtime model
    let uid, givenName, ingress, token;
    if ("uid" in runtime && typeof runtime.uid !== "undefined") {
      // Runtime model with properties
      uid = runtime.uid;
      givenName = (runtime as any).givenName || runtime.given_name;
      ingress =
        (runtime as any).jupyterUrl || runtime.ingress || runtime.jupyter_url;
      token =
        (runtime as any).jupyterToken || runtime.token || runtime.jupyter_token;
    } else if (typeof (runtime as any).toJSON === "function") {
      // Has toJSON method
      const data = (runtime as any).toJSON();
      uid = data.uid;
      givenName = data.given_name;
      ingress = data.ingress || data.jupyter_url;
      token = data.token || data.jupyter_token;
    } else {
      // Plain object
      uid = runtime.uid;
      givenName = runtime.given_name;
      ingress = runtime.ingress || runtime.jupyter_url;
      token = runtime.token || runtime.jupyter_token;
    }

    console.log("[RuntimeSelector] Selected existing runtime:", uid);
    console.log("[RuntimeSelector] Selected runtime details:", {
      uid: uid,
      given_name: givenName,
      ingress: ingress,
      token: token,
    });
    return selected.runtime;
  } else if (selected.action === "create" && selected.environment) {
    // Create new runtime
    console.log(
      "[RuntimeSelector] User selected create action with environment:",
      {
        name: selected.environment.name,
        title: selected.environment.title,
        description: selected.environment.description,
      }
    );
    console.log("[RuntimeSelector] About to call createRuntime function...");
    const result = await createRuntime(sdk, selected.environment);
    console.log("[RuntimeSelector] createRuntime returned:", result);
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
  sdk: DatalayerSDK,
  environment: Environment
): Promise<Runtime | undefined> {
  console.log("[RuntimeSelector] createRuntime called with environment:", {
    name: environment.name,
    title: environment.title,
    description: environment.description,
  });

  // Prompt for runtime name (human-readable)
  console.log("[RuntimeSelector] Showing input box for runtime name...");
  const name = await vscode.window.showInputBox({
    title: `Create ${environment.title || environment.name} Runtime`,
    prompt: "Enter a friendly name for the new runtime",
    placeHolder: `My ${environment.title || environment.name} Runtime`,
    validateInput: (value) => {
      console.log(
        "[RuntimeSelector] Input validation called with value:",
        value
      );
      if (!value || value.trim().length === 0) {
        return "Runtime name cannot be empty";
      }
      // Allow any human-readable name - the API will handle any restrictions
      return undefined;
    },
  });

  console.log("[RuntimeSelector] Input box returned name:", name);
  if (!name) {
    console.log(
      "[RuntimeSelector] User cancelled input box or provided empty name"
    );
    return undefined;
  }

  // Get default credits limit from settings
  const defaultCreditsLimit = vscode.workspace
    .getConfiguration("datalayer.runtime")
    .get<number>("creditsLimit", 10);

  // Prompt for credits limit
  console.log("[RuntimeSelector] Showing input box for credits limit...");
  const creditsInput = await vscode.window.showInputBox({
    title: `Set Credits Limit for "${name}"`,
    prompt: "Enter the maximum credits this runtime can consume",
    placeHolder: `Credits limit (default: ${defaultCreditsLimit})`,
    value: defaultCreditsLimit.toString(), // Pre-populate with default value
    validateInput: (value) => {
      console.log(
        "[RuntimeSelector] Credits validation called with value:",
        value
      );
      if (!value || value.trim().length === 0) {
        return undefined; // Allow empty to use default
      }
      const num = Number(value);
      if (isNaN(num) || num <= 0) {
        return "Credits limit must be a positive number";
      }
      if (num > 1000) {
        return "Credits limit cannot exceed 1000";
      }
      return undefined;
    },
  });

  console.log("[RuntimeSelector] Credits input box returned:", creditsInput);

  // If user cancelled the credits dialog, we should still proceed with default
  // Only cancel if they cancelled the name dialog
  let creditsLimit: number;
  if (creditsInput === undefined) {
    // User pressed ESC - ask if they want to use default or cancel
    console.log(
      "[RuntimeSelector] User cancelled credits input, using default"
    );
    creditsLimit = defaultCreditsLimit;
  } else {
    creditsLimit = creditsInput ? Number(creditsInput) : defaultCreditsLimit;
  }
  console.log("[RuntimeSelector] Using credits limit:", creditsLimit);

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
        console.log(
          "[RuntimeSelector] About to call SDK createRuntime with params:",
          {
            given_name: name,
            environment_name: environment.name,
            credits_limit: creditsLimit,
          }
        );

        // Check if SDK has createRuntime method
        if (typeof (sdk as any).createRuntime !== "function") {
          throw new Error("SDK does not have createRuntime method");
        }

        const runtime = await (sdk as any).createRuntime({
          given_name: name,
          environment_name: environment.name,
          credits_limit: creditsLimit,
        });

        progress.report({
          increment: 25,
          message: "Runtime created successfully!",
        });
        console.log("[RuntimeSelector] Created runtime object:", runtime);

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
          const runtimes = await (sdk as any).listRuntimes();
          readyRuntime = runtimes.find((r: Runtime) => r.uid === runtime.uid);

          // Check if runtime has connection info
          if (
            readyRuntime &&
            (readyRuntime.ingress || readyRuntime.jupyter_base_url)
          ) {
            console.log(
              "[RuntimeSelector] Runtime ready with connection info:",
              readyRuntime
            );
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
            `Runtime "${name}" created and ready!`
          );
          return readyRuntime;
        }

        // If we still don't have connection info, return what we have
        console.log(
          "[RuntimeSelector] Warning: Runtime created but may not have full connection info yet"
        );
        vscode.window.showInformationMessage(
          `Runtime "${name}" created but still initializing`
        );
        return runtime;
      } catch (error) {
        console.error("[RuntimeSelector] Failed to create runtime:", error);
        vscode.window.showErrorMessage(`Failed to create runtime: ${error}`);
        return undefined;
      }
    }
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
        console.error("Invalid URL provided: ", reason);
        return {
          message: "Invalid Jupyter Server URL",
          severity: vscode.InputBoxValidationSeverity.Error,
        };
      }
    },
  });
}
