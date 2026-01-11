/*
 * Copyright (c) 2021-2025 Datalayer, Inc.
 *
 * MIT License
 */

/**
 * Unified Welcome/Onboarding Experience
 *
 * Shows a single unified prompt that handles both:
 * 1. Setting Datalayer as default notebook editor
 * 2. Disabling Jupyter tools to avoid Copilot conflicts
 *
 * This avoids annoying users with multiple prompts on first activation.
 */

import * as vscode from "vscode";
import type { ILogger } from "../services/interfaces/ILogger";

/**
 * Disables the built-in newJupyterNotebook tool to prevent conflicts with Datalayer's tool.
 * This ensures Copilot always uses datalayer_createNotebook instead.
 *
 * Note: This is a placeholder - VS Code doesn't allow programmatic tool disabling.
 * Users must manually disable built-in tools via Copilot settings if needed.
 *
 * @param _context - Extension context (unused, kept for API compatibility)
 * @param logger - Logger instance for tracking
 */
export async function disableBuiltInNotebookTool(
  _context: vscode.ExtensionContext,
  logger: ILogger,
): Promise<void> {
  // No-op: VS Code doesn't support programmatic tool disabling
  logger.info(
    "Built-in tool handling: Users can manually configure via Copilot settings",
  );
}

/**
 * Opens the Datalayer sidebar on first run and pins it to the Activity Bar.
 * This ensures the Datalayer icon is visible and not hidden in the overflow menu.
 *
 * @param context - Extension context for storing state
 * @param logger - Logger instance for tracking
 */
async function openSidebarOnFirstRun(
  context: vscode.ExtensionContext,
  logger: ILogger,
): Promise<void> {
  const SIDEBAR_OPENED_KEY = "datalayer.sidebarOpenedOnFirstRun";

  // Check if we've already opened the sidebar on first run
  const hasOpenedSidebar = context.globalState.get<boolean>(
    SIDEBAR_OPENED_KEY,
    false,
  );

  if (!hasOpenedSidebar) {
    try {
      // Move the Datalayer icon from overflow menu to visible Activity Bar
      const config = vscode.workspace.getConfiguration();
      const currentPinnedViews = config.get<string[]>(
        "workbench.activityBar.pinnedViewlets",
        [],
      );

      // Add Datalayer view container to pinned views if not already there
      const datalayerViewId = "workbench.view.extension.datalayer";
      if (!currentPinnedViews.includes(datalayerViewId)) {
        const updatedPinnedViews = [...currentPinnedViews, datalayerViewId];
        await config.update(
          "workbench.activityBar.pinnedViewlets",
          updatedPinnedViews,
          vscode.ConfigurationTarget.Global,
        );
        logger.info("Pinned Datalayer icon to Activity Bar");
      }

      // Focus on the Datalayer view container (opens the sidebar)
      await vscode.commands.executeCommand(datalayerViewId);
      logger.info("Opened Datalayer sidebar on first run");

      // Mark that we've opened the sidebar
      await context.globalState.update(SIDEBAR_OPENED_KEY, true);
    } catch (error) {
      logger.warn("Failed to open Datalayer sidebar on first run", {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
}

/**
 * Shows unified welcome prompt combining default editor + Jupyter tools configuration.
 * Only shows once per installation (tracked via global state).
 *
 * @param context - Extension context for state management
 * @param logger - Logger for tracking user choices
 */
export async function showUnifiedWelcomePrompt(
  context: vscode.ExtensionContext,
  logger: ILogger,
): Promise<void> {
  const ONBOARDING_COMPLETE_KEY = "datalayer.onboardingComplete";

  // First, handle sidebar opening (always do this on first run, even if onboarding is disabled)
  await openSidebarOnFirstRun(context, logger);

  // Check if onboarding already completed
  const completed = context.globalState.get<boolean>(
    ONBOARDING_COMPLETE_KEY,
    false,
  );

  logger.info("Onboarding state check", { completed });

  if (completed) {
    logger.info("Onboarding already completed, skipping");
    return;
  }

  // Migrate from legacy state keys if they exist
  const legacyEditorKey = "datalayer.defaultEditorPromptShown";
  const legacyJupyterKey = "datalayer.jupyterToolsPromptShown";

  const hasLegacyState =
    context.globalState.get<boolean>(legacyEditorKey, false) ||
    context.globalState.get<boolean>(legacyJupyterKey, false);

  if (hasLegacyState) {
    // User already saw old prompts, mark as complete and don't show again
    await context.globalState.update(ONBOARDING_COMPLETE_KEY, true);
    logger.info("Migrated from legacy onboarding state, skipping welcome");
    return;
  }

  // Check if user disabled onboarding via configuration
  const config = vscode.workspace.getConfiguration("datalayer.onboarding");
  const showWelcome = config.get<boolean>("showWelcome", true);
  if (!showWelcome) {
    logger.info("Onboarding disabled via configuration");
    await context.globalState.update(ONBOARDING_COMPLETE_KEY, true);
    return;
  }

  // Detect environment
  const jupyterExt = vscode.extensions.getExtension("ms-toolsai.jupyter");
  const hasJupyter = !!jupyterExt;

  const jupyterToolsEnabled = hasJupyter
    ? vscode.workspace
        .getConfiguration("jupyter")
        .get<boolean>("languageModelTools.enabled", true)
    : false;

  // Check current default editor
  const currentDefault = vscode.workspace
    .getConfiguration()
    .get<string>("workbench.editorAssociations.*.ipynb");
  const isDefaultEditor = currentDefault === "datalayer.jupyter-notebook";

  // Build description of what will be configured
  const configItems: string[] = [];
  if (!isDefaultEditor) {
    configItems.push("default editor");
  }
  if (hasJupyter && jupyterToolsEnabled) {
    configItems.push("Jupyter tools");
  }

  // If already configured, skip the notification
  if (configItems.length === 0) {
    logger.info("Already configured, skipping welcome notification");
    await context.globalState.update(ONBOARDING_COMPLETE_KEY, true);
    return;
  }

  // Build message
  const message =
    configItems.length === 2
      ? "Welcome to Datalayer! Configure recommended settings (default editor & Jupyter tools)?"
      : `Welcome to Datalayer! Configure recommended ${configItems[0]}?`;

  // Show notification with action buttons
  const selected = await vscode.window.showInformationMessage(
    message,
    "Apply Recommended",
    "Customize",
    "Not Now",
  );

  // Only mark as complete if user explicitly chose "Not Now"
  // If dismissed (undefined), notification will appear again next time
  if (!selected) {
    logger.info(
      "Welcome notification dismissed without selection - will show again",
    );
    return;
  }

  if (selected === "Not Now") {
    logger.info("User chose 'Not Now' - marking onboarding complete");
    await context.globalState.update(ONBOARDING_COMPLETE_KEY, true);
    return;
  }

  logger.info("User chose onboarding action", { action: selected });

  // Handle user choice
  if (selected === "Apply Recommended") {
    await applyRecommendedSettings(
      hasJupyter,
      jupyterToolsEnabled,
      isDefaultEditor,
      logger,
    );
    await context.globalState.update(ONBOARDING_COMPLETE_KEY, true);

    // Show success message with reload option
    const reload = await vscode.window.showInformationMessage(
      "✅ Configuration applied! Reload window to ensure all changes take effect.",
      "Reload Now",
      "Later",
    );

    if (reload === "Reload Now") {
      await vscode.commands.executeCommand("workbench.action.reloadWindow");
    }
  } else if (selected === "Customize") {
    await showCustomizationUI(
      hasJupyter,
      jupyterToolsEnabled,
      isDefaultEditor,
      logger,
    );
    await context.globalState.update(ONBOARDING_COMPLETE_KEY, true);
  }
}

/**
 * Applies all recommended settings automatically.
 */
async function applyRecommendedSettings(
  hasJupyter: boolean,
  jupyterToolsEnabled: boolean,
  isDefaultEditor: boolean,
  logger: ILogger,
): Promise<void> {
  const config = vscode.workspace.getConfiguration();

  // 1. Set default notebook editor
  if (!isDefaultEditor) {
    try {
      await config.update(
        "workbench.editorAssociations",
        {
          "*.ipynb": "datalayer.jupyter-notebook",
        },
        vscode.ConfigurationTarget.Global,
      );
      logger.info("Applied: Default notebook editor");
    } catch (error) {
      logger.error("Failed to set default editor", error as Error);
    }
  }

  // 2. Disable Jupyter tools if needed
  if (hasJupyter && jupyterToolsEnabled) {
    try {
      const currentValue = vscode.workspace
        .getConfiguration("jupyter")
        .get("languageModelTools.enabled");

      logger.info("Attempting to disable Jupyter tools", {
        hasJupyter,
        jupyterToolsEnabled,
        currentValue,
      });

      await vscode.workspace
        .getConfiguration("jupyter")
        .update(
          "languageModelTools.enabled",
          false,
          vscode.ConfigurationTarget.Global,
        );

      // Verify the change was applied
      const newValue = vscode.workspace
        .getConfiguration("jupyter")
        .get("languageModelTools.enabled");

      logger.info("Applied: Disabled Jupyter tools", {
        newValue,
        success: newValue === false,
      });
    } catch (error) {
      logger.error("Failed to disable Jupyter tools", error as Error);
    }
  }
}

/**
 * Shows customization UI where user can pick which settings to apply.
 */
async function showCustomizationUI(
  hasJupyter: boolean,
  jupyterToolsEnabled: boolean,
  isDefaultEditor: boolean,
  logger: ILogger,
): Promise<void> {
  interface SettingChoice {
    label: string;
    description: string;
    setting: "defaultEditor" | "jupyterTools";
    alreadySet: boolean;
  }

  const choices: SettingChoice[] = [];

  // Option 1: Default editor
  choices.push({
    label: isDefaultEditor
      ? "$(check) Default Notebook Editor"
      : "$(circle-outline) Default Notebook Editor",
    description: isDefaultEditor
      ? "Already set to Datalayer"
      : "Set Datalayer as default for .ipynb files",
    setting: "defaultEditor",
    alreadySet: isDefaultEditor,
  });

  // Option 2: Jupyter tools (only if Jupyter installed)
  if (hasJupyter) {
    choices.push({
      label: !jupyterToolsEnabled
        ? "$(check) Jupyter Tools"
        : "$(circle-outline) Jupyter Tools",
      description: !jupyterToolsEnabled
        ? "Already disabled (no conflicts)"
        : "Disable to avoid Copilot tool conflicts",
      setting: "jupyterTools",
      alreadySet: !jupyterToolsEnabled,
    });
  }

  const selected = await vscode.window.showQuickPick(choices, {
    title: "Customize Settings",
    placeHolder:
      "Select settings to apply (already configured settings marked ✓)",
    canPickMany: true,
    ignoreFocusOut: true,
  });

  if (!selected || selected.length === 0) {
    logger.info("User cancelled customization");
    return;
  }

  const config = vscode.workspace.getConfiguration();

  // Apply selected settings
  for (const choice of selected) {
    if (choice.alreadySet) {
      continue; // Skip if already set
    }

    if (choice.setting === "defaultEditor") {
      try {
        await config.update(
          "workbench.editorAssociations",
          {
            "*.ipynb": "datalayer.jupyter-notebook",
          },
          vscode.ConfigurationTarget.Global,
        );
        logger.info("Applied: Default notebook editor (via customization)");
      } catch (error) {
        logger.error("Failed to set default editor", error as Error);
      }
    } else if (choice.setting === "jupyterTools") {
      try {
        await vscode.workspace
          .getConfiguration("jupyter")
          .update(
            "languageModelTools.enabled",
            false,
            vscode.ConfigurationTarget.Global,
          );
        logger.info("Applied: Disabled Jupyter tools (via customization)");
      } catch (error) {
        logger.error("Failed to disable Jupyter tools", error as Error);
      }
    }
  }

  // Show success message
  const reload = await vscode.window.showInformationMessage(
    `✅ Applied ${selected.length} setting(s). Reload window to ensure all changes take effect.`,
    "Reload Now",
    "Later",
  );

  if (reload === "Reload Now") {
    await vscode.commands.executeCommand("workbench.action.reloadWindow");
  }
}
