/*
 * Copyright (c) 2021-2025 Datalayer, Inc.
 *
 * MIT License
 */

/**
 * Runtime selection utility for notebook execution.
 * Provides UI for selecting existing runtimes or creating new ones.
 *
 * @module utils/runtimeSelector
 */

import type { DatalayerClient } from "@datalayer/core/lib/client";
import type { EnvironmentDTO } from "@datalayer/core/lib/models/EnvironmentDTO";
import type { RuntimeDTO } from "@datalayer/core/lib/models/RuntimeDTO";
import type { RuntimeSnapshotDTO } from "@datalayer/core/lib/models/RuntimeSnapshotDTO";
import * as vscode from "vscode";

import { EnvironmentCache } from "../../services/cache/environmentCache";
import type { IAuthProvider } from "../../services/interfaces/IAuthProvider";
import { formatRelativeTime } from "../../utils/dateFormatter";
import { generateRuntimeName } from "../../utils/runtimeNameGenerator";
import { promptAndLogin } from "./authDialog";

/**
 * QuickPick item for runtime selection with optional runtime or environment data.
 */
interface RuntimeQuickPickItem extends vscode.QuickPickItem {
  runtime?: RuntimeDTO;
  action?: "create";
  environment?: EnvironmentDTO;
}

/**
 * Options for configuring the runtime selection dialog behavior.
 */
export interface RuntimeSelectorOptions {
  /**
   * If true, hides existing runtimes and only shows create options.
   * Useful when called from the Runtimes tree view where the user
   * explicitly wants to create a NEW runtime.
   * Default: false (show existing runtimes).
   */
  hideExistingRuntimes?: boolean;

  /**
   * Callback called IMMEDIATELY when user selects a runtime (before QuickPick closes).
   * Used to trigger instant visual feedback like showing a spinner.
   */
  onRuntimeSelected?: (runtime: RuntimeDTO) => void | Promise<void>;
}

/**
 * Formats the start time of a runtime as a relative time string.
 * @param runtime - Runtime DTO with startedAt getter.
 *
 * @returns Formatted string like " - Started 5 minutes ago", or empty string on failure.
 */
function formatRuntimeTimeInfo(runtime: RuntimeDTO): string {
  try {
    const startTime = runtime.startedAt;
    if (!startTime) {
      return "";
    }
    const diffMs = Date.now() - startTime.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHours / 24);

    if (diffDays > 0) {
      return ` • Started ${diffDays} day${diffDays > 1 ? "s" : ""} ago`;
    }
    if (diffHours > 0) {
      return ` • Started ${diffHours} hour${diffHours > 1 ? "s" : ""} ago`;
    }
    if (diffMins > 0) {
      return ` • Started ${diffMins} minute${diffMins > 1 ? "s" : ""} ago`;
    }
    return ` • Just started`;
  } catch (_error) {
    return "";
  }
}

/**
 * Builds QuickPick items from sorted runtimes and environments.
 * @param runtimes - Available runtimes sorted by start time.
 * @param environments - Available environments for creating new runtimes.
 *
 * @returns Array of QuickPick items for the runtime selector.
 */
function buildRuntimeQuickPickItems(
  runtimes: RuntimeDTO[],
  environments: EnvironmentDTO[],
): RuntimeQuickPickItem[] {
  const items: RuntimeQuickPickItem[] = [];

  if (runtimes.length > 0) {
    for (const runtime of runtimes) {
      const runtimeData = runtime.toJSON();
      const displayName =
        runtimeData.givenName ??
        runtimeData.podName ??
        `Runtime ${runtimeData.uid.slice(0, 8)}`;
      const env =
        runtimeData.environmentTitle ??
        runtimeData.environmentName ??
        "unknown";
      const timeInfo = formatRuntimeTimeInfo(runtime);

      items.push({
        label: `$(play) ${displayName}`,
        description: env,
        detail: `Status: ready${timeInfo}`,
        runtime: runtime,
      });
    }

    items.push({
      label: "Create New Runtime",
      kind: vscode.QuickPickItemKind.Separator,
    });
  }

  for (const env of environments) {
    const envTitle = env.title ?? env.name ?? "Unknown";
    items.push({
      label: `$(add) Create new ${envTitle} Runtime`,
      description: env.name,
      detail: env.description ?? `Create a new ${envTitle} runtime`,
      action: "create",
      environment: env,
    });
  }

  return items;
}

/**
 * Loads runtimes and environments from the Datalayer platform with progress indicator.
 * @param datalayer - Datalayer client instance.
 * @param authProvider - Authentication provider.
 * @param hideExistingRuntimes - Whether to skip loading existing runtimes.
 *
 * @returns Loaded data or null if cancelled/failed.
 */
async function loadRuntimeData(
  datalayer: DatalayerClient,
  authProvider: IAuthProvider,
  hideExistingRuntimes: boolean,
): Promise<{ runtimes: RuntimeDTO[]; environments: EnvironmentDTO[] } | null> {
  return vscode.window.withProgress(
    {
      location: vscode.ProgressLocation.Notification,
      title: hideExistingRuntimes
        ? "Loading Datalayer environments..."
        : "Loading Datalayer runtimes...",
      cancellable: true,
    },
    async (_progress, token) => {
      if (token.isCancellationRequested) {
        return null;
      }
      try {
        const runtimes = hideExistingRuntimes
          ? []
          : await datalayer.listRuntimes();
        const environments =
          await EnvironmentCache.getInstance().getEnvironments(
            datalayer,
            authProvider,
          );
        return { runtimes, environments };
      } catch (error) {
        vscode.window.showErrorMessage(`Failed to load runtimes: ${error}`);
        return null;
      }
    },
  );
}

/**
 * Shows a QuickPick dialog for selecting or creating a Datalayer runtime.
 *
 * @param datalayer - Datalayer instance for API access.
 * @param authProvider - Authentication provider for login state.
 * @param options - Optional configuration for the dialog.
 *
 * @returns Selected or created runtime, or undefined if cancelled.
 */
export async function selectDatalayerRuntime(
  datalayer: DatalayerClient,
  authProvider: IAuthProvider,
  options?: RuntimeSelectorOptions,
): Promise<RuntimeDTO | undefined> {
  const { hideExistingRuntimes = false, onRuntimeSelected } = options ?? {};

  // Check authentication first
  if (!authProvider.isAuthenticated()) {
    await promptAndLogin("Runtime Selection");
    // Check again after login attempt
    if (!authProvider.isAuthenticated()) {
      return undefined;
    }
  }

  const loadedData = await loadRuntimeData(
    datalayer,
    authProvider,
    hideExistingRuntimes,
  );
  if (!loadedData) {
    return undefined;
  }

  const { runtimes, environments } = loadedData;

  // Sort runtimes by most recent first
  const validRuntimes = runtimes.sort((a: RuntimeDTO, b: RuntimeDTO) => {
    const getStartTime = (runtime: RuntimeDTO): number => {
      try {
        return runtime.startedAt ? runtime.startedAt.getTime() : 0;
      } catch (_error) {
        return 0;
      }
    };
    return getStartTime(b) - getStartTime(a);
  });

  const items = buildRuntimeQuickPickItems(validRuntimes, environments);

  if (
    items.length === 0 ||
    (items.length === 1 &&
      items[0]!.kind === vscode.QuickPickItemKind.Separator)
  ) {
    vscode.window.showInformationMessage(
      "No runtimes or environments available",
    );
    return undefined;
  }

  // Create QuickPick with instant callback support
  const quickPick = vscode.window.createQuickPick<RuntimeQuickPickItem>();
  quickPick.title = hideExistingRuntimes
    ? "Create New Runtime"
    : "Select Datalayer Runtime";
  quickPick.placeholder = hideExistingRuntimes
    ? "Choose an environment for your new runtime"
    : "Choose an existing runtime or create a new one";
  quickPick.ignoreFocusOut = true;
  quickPick.items = items;

  // Call callback IMMEDIATELY when existing runtime is selected
  // This enables instant visual feedback like showing a spinner
  if (onRuntimeSelected) {
    quickPick.onDidChangeSelection((selected) => {
      if (selected.length > 0 && selected[0]!.runtime) {
        // Existing runtime selected - call callback immediately for instant feedback
        void onRuntimeSelected(selected[0]!.runtime);
      }
      // Note: For create actions, callback is called AFTER user accepts all creation options
      // (see below where createRuntime is called)
    });
  }

  const selected = await new Promise<RuntimeQuickPickItem | undefined>(
    (resolve) => {
      quickPick.onDidAccept(() => {
        const selection = quickPick.selectedItems[0];
        quickPick.hide();
        resolve(selection);
      });
      quickPick.onDidHide(() => {
        resolve(undefined);
      });
      quickPick.show();
    },
  );

  quickPick.dispose();

  if (!selected) {
    return undefined;
  }

  if (selected.runtime) {
    return selected.runtime;
  }

  if (selected.action === "create" && selected.environment) {
    return createRuntime(
      datalayer,
      selected.environment,
      undefined,
      onRuntimeSelected,
    );
  }

  return undefined;
}

/**
 * Shows a QuickPick dialog for selecting a snapshot to start runtime from.
 * Returns undefined if user wants to start fresh (no snapshot),
 * null if user cancelled,
 * or the snapshot ID if user selected a snapshot.
 *
 * @param snapshots - Array of available snapshots (already filtered for deleted).
 *
 * @returns Snapshot ID, undefined (fresh start), or null (cancelled).
 */
async function selectSnapshot(
  snapshots: RuntimeSnapshotDTO[],
): Promise<string | undefined | null> {
  // Interface for snapshot QuickPick items
  interface SnapshotQuickPickItem extends vscode.QuickPickItem {
    snapshotId?: string;
    action?: "fresh";
  }

  try {
    // Build QuickPick items
    const items: SnapshotQuickPickItem[] = [];

    // Add "Start fresh" option at the top
    items.push({
      label: "$(file-directory) Start with fresh environment",
      description: "No snapshot",
      detail: "Create runtime from scratch without any saved state",
      action: "fresh",
    });

    // Add separator if there are snapshots
    if (snapshots.length > 0) {
      items.push({
        label: "Start from Snapshot",
        kind: vscode.QuickPickItemKind.Separator,
      });

      // Add snapshot items
      for (const snapshot of snapshots) {
        // Skip deleted snapshots (status might be "deleted", "DELETED", or similar)
        const rawData = snapshot.rawData();
        if (
          rawData.status &&
          rawData.status.toLowerCase().includes("deleted")
        ) {
          continue;
        }

        // Format the snapshot date
        let dateInfo = "";
        try {
          const snapshotData = snapshot.toJSON();
          if (snapshotData.updatedAt) {
            const date = new Date(snapshotData.updatedAt);
            dateInfo = formatRelativeTime(date);
          }

          items.push({
            label: `$(archive) ${snapshotData.name || `Snapshot ${snapshotData.uid?.slice(0, 8)}`}`,
            description: dateInfo,
            detail: snapshotData.description || "Saved runtime state",
            snapshotId: snapshotData.uid,
          });
        } catch (_error) {
          // Skip malformed snapshots
          continue;
        }
      }
    }

    // Show QuickPick
    const selected = await vscode.window.showQuickPick(items, {
      title: "Start Runtime from Snapshot?",
      placeHolder:
        snapshots.length > 0
          ? "Choose a snapshot or start fresh"
          : "No snapshots available - will start fresh",
      ignoreFocusOut: true,
    });

    // Handle cancellation
    if (!selected) {
      return null;
    }

    // Handle "fresh start" selection
    if (selected.action === "fresh") {
      return undefined;
    }

    // Return the selected snapshot ID
    return selected.snapshotId;
  } catch (_error) {
    // If there's an error building the picker, skip snapshots
    return undefined;
  }
}

/**
 * Creates a new runtime with the specified environment.
 *
 * @param datalayer - Datalayer instance for API access.
 * @param environment - Environment to use for the runtime.
 * @param preSelectedSnapshotId - Optional snapshot ID to restore from (skips snapshot selection).
 * @param onRuntimeCreating - Optional callback triggered when runtime creation starts (after all dialogs).
 *
 * @returns Created runtime or undefined if cancelled or failed.
 *
 * @throws Error if the environment is missing the burningRate property.
 */
export async function createRuntime(
  datalayer: DatalayerClient,
  environment: EnvironmentDTO,
  preSelectedSnapshotId?: string,
  onRuntimeCreating?: (runtime: RuntimeDTO) => void | Promise<void>,
): Promise<RuntimeDTO | undefined> {
  // Step 1: Determine snapshot to use
  let snapshotId: string | undefined = preSelectedSnapshotId;

  // Only show snapshot selection dialog if no snapshot was pre-selected
  if (!preSelectedSnapshotId) {
    try {
      // Fetch available snapshots (deleted snapshots are not returned by API)
      const availableSnapshots = await datalayer.listSnapshots();

      // Only show snapshot selection dialog if there are snapshots
      if (availableSnapshots && availableSnapshots.length > 0) {
        const selectedSnapshotId = await selectSnapshot(availableSnapshots);

        // If user cancelled snapshot selection, abort runtime creation
        if (selectedSnapshotId === null) {
          return undefined;
        }

        snapshotId = selectedSnapshotId;
      }
      // If no snapshots available, continue with undefined (fresh start)
    } catch (_error) {
      // If snapshot fetching fails, continue without snapshots (silent failure)
    }
  }

  // Step 2: Prompt for runtime name (human-readable)
  const suggestedName = generateRuntimeName();
  const name = await vscode.window.showInputBox({
    title: `Create ${environment.title ?? environment.name} Runtime`,
    prompt: "Enter a friendly name for the new runtime",
    placeHolder: `e.g., ${suggestedName}`,
    value: suggestedName, // Pre-populate with generated name
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
  let netAvailableCredits: number | undefined;
  let maxMinutes: number | undefined;
  let hasActiveRuntimes = false;

  try {
    const credits = await datalayer.getCredits();

    // Use net available credits (accounts for existing reservations)
    netAvailableCredits = credits.netAvailable;
    hasActiveRuntimes = credits.hasActiveRuntimes;

    // Check if environment has burning rate (use camelCase from Datalayer model)
    if (!environment.burningRate) {
      throw new Error(
        `Environment "${environment.name}" is missing the burningRate property from the API. ` +
          `This is required to calculate runtime credits. Please contact support.`,
      );
    }

    // Calculate max minutes based on net available credits using Datalayer utility
    maxMinutes = datalayer.calculateMaxRuntimeMinutes(
      credits.netAvailable,
      environment.burningRate,
    );

    // Enforce 24-hour maximum (1440 minutes)
    if (maxMinutes !== undefined) {
      maxMinutes = Math.min(maxMinutes, 1440);
    } else {
      maxMinutes = 1440;
    }
  } catch (_error) {
    // If credits API fails, still enforce 24-hour maximum
    maxMinutes = 1440;
  }

  // Get default runtime duration from settings (in minutes)
  const defaultMinutes = vscode.workspace
    .getConfiguration("datalayer.runtime")
    .get<number>("defaultMinutes", 3);
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

  // Check if environment has burning rate (use camelCase from Datalayer model)
  if (!environment.burningRate) {
    throw new Error(
      `Environment "${environment.name}" is missing the burningRate property from the API. ` +
        `This is required to calculate runtime credits. Please contact support.`,
    );
  }

  // Calculate credits needed based on burning rate using Datalayer utility
  const creditsLimit = datalayer.calculateCreditsRequired(
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

        // Trigger spinner callback NOW - user has accepted all options
        if (onRuntimeCreating) {
          const tempRuntime = {
            uid: "creating",
            givenName: `Creating ${environment.title || environment.name}...`,
            podName: "creating",
            environmentName: environment.name,
            environmentTitle: environment.title || environment.name,
            type: "notebook",
            burningRate: 0,
            ingress: "",
            token: "",
            startedAt: new Date().toISOString(),
            expiredAt: "",
          } as unknown as RuntimeDTO;
          await onRuntimeCreating(tempRuntime);
        }

        // Create the runtime

        // Check if Datalayer has createRuntime method
        if (typeof datalayer.createRuntime !== "function") {
          throw new Error("Datalayer does not have createRuntime method");
        }

        const runtime = await datalayer.createRuntime(
          environment.name,
          "notebook",
          name,
          creditsLimit,
          snapshotId, // Pass snapshot ID (undefined if starting fresh)
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
          const runtimes = await datalayer.listRuntimes();
          readyRuntime = runtimes.find(
            (r: RuntimeDTO) => r.uid === runtime.uid,
          );

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
 * @returns The validated server URL or undefined if cancelled.
 *
 * @deprecated Use selectDatalayerRuntime instead.
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
      } catch (_reason) {
        return {
          message: "Invalid Jupyter Server URL",
          severity: vscode.InputBoxValidationSeverity.Error,
        };
      }
    },
  });
}
