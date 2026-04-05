/*
 * Copyright (c) 2021-2025 Datalayer, Inc.
 *
 * MIT License
 */

/**
 * Centralized settings validation for the Datalayer VS Code extension.
 * Uses Zod schemas to validate VS Code workspace configuration values
 * and provides safe defaults when invalid values are detected.
 *
 * @module services/config/settingsValidator
 */

import * as vscode from "vscode";
import { z } from "zod";

import { ServiceLoggers } from "../logging/loggers";

// ---------------------------------------------------------------------------
// Zod schemas
// ---------------------------------------------------------------------------

/**
 * URL schema that validates strings as valid HTTP or HTTPS URLs.
 * The default is used when the value is missing (undefined). Invalid strings
 * fail validation and are handled by `validateSection()` which drops the
 * invalid field and re-parses so the schema default fills in.
 *
 * @param defaultValue - The default URL used when the setting is missing.
 *
 * @returns A Zod string schema with URL validation and a default value.
 */
function urlSchema(defaultValue: string): z.ZodType<string> {
  return z
    .string()
    .refine((val) => {
      try {
        const parsed = new URL(val);
        return parsed.protocol === "http:" || parsed.protocol === "https:";
      } catch {
        return false;
      }
    }, "Must be a valid HTTP or HTTPS URL")
    .default(defaultValue);
}

/**
 * WebSocket URL schema that validates strings as well-formed WebSocket URLs.
 * Uses `new URL()` for structural validation and enforces the ws:// or wss://
 * scheme. The default is used when the value is missing (undefined). Invalid
 * strings fail validation and are handled by `validateSection()` which drops
 * the invalid field and re-parses so the schema default fills in.
 *
 * @param defaultValue - The default WebSocket URL used when the setting is missing.
 *
 * @returns A Zod schema with WebSocket URL validation and a default value.
 */
function wsUrlSchema(defaultValue: string): z.ZodType<string> {
  return z
    .string()
    .refine((val) => {
      try {
        const parsed = new URL(val);
        return parsed.protocol === "ws:" || parsed.protocol === "wss:";
      } catch {
        return false;
      }
    }, "Must be a valid WebSocket URL (ws:// or wss://)")
    .default(defaultValue);
}

/** Schema for the `datalayer.services` settings group. */
export const servicesSettingsSchema = z.object({
  /** IAM service URL. */
  iamUrl: urlSchema("https://prod1.datalayer.run"),
  /** Runtimes service URL. */
  runtimesUrl: urlSchema("https://r1.datalayer.run"),
  /** Spacer service URL. */
  spacerUrl: urlSchema("https://prod1.datalayer.run"),
  /** WebSocket URL for Spacer real-time collaboration. */
  spacerWsUrl: wsUrlSchema("wss://prod1.datalayer.run"),
});

/** Schema for the `datalayer.runtime` settings group. */
export const runtimeSettingsSchema = z.object({
  /** Default runtime duration in minutes. */
  defaultMinutes: z.number().int().min(1).max(1440).default(3),
  /** Default runtime type. */
  defaultType: z.enum(["CPU", "GPU"]).default("CPU"),
});

/** Schema for the `datalayer.logging` settings group. */
export const loggingSettingsSchema = z.object({
  /** Minimum log level. */
  level: z.enum(["trace", "debug", "info", "warn", "error"]).default("info"),
  /** Include timestamps in log messages. */
  includeTimestamps: z.boolean().default(true),
  /** Include context information in log messages. */
  includeContext: z.boolean().default(true),
  /** Enable Datalayer operation logging. */
  enableDatalayerLogging: z.boolean().default(true),
  /** Toggle performance monitoring with timing and memory tracking. */
  enablePerformanceMonitoring: z.boolean().default(false),
});

/** Valid auto-connect strategy values. */
const autoConnectStrategyEnum = z.enum(["Pyodide", "Active Runtime", "Ask"]);

/** Schema for the `datalayer.autoConnect` settings group. */
export const autoConnectSettingsSchema = z.object({
  /** Ordered list of auto-connect strategies. */
  strategies: z.array(autoConnectStrategyEnum).default(["Pyodide"]),
});

/** Schema for the `datalayer.onboarding` settings group. */
export const onboardingSettingsSchema = z.object({
  /** Whether to show the welcome prompt. */
  showWelcome: z.boolean().default(true),
});

/** Schema for the `datalayer.tools` settings group. */
export const toolsSettingsSchema = z.object({
  /** Response format for MCP tool responses. */
  responseFormat: z.enum(["json", "toon"]).default("toon"),
});

/** Schema for the `datalayer.pyodide` settings group. */
export const pyodideSettingsSchema = z.object({
  /** Preload behavior for Pyodide packages. */
  preloadBehavior: z
    .enum(["auto", "ask-once", "ask-always", "disabled"])
    .default("auto"),
  /** Pyodide version string. */
  version: z.string().min(1).default("0.27.3"),
  /** Python packages to preload. */
  preloadPackages: z
    .array(z.string())
    .default(["numpy", "pandas", "matplotlib", "matplotlib-inline", "ipython"]),
});

/** Schema for the `datalayer.completion.inlinellm` settings group. */
export const inlineLlmCompletionSettingsSchema = z.object({
  /** Toggle LLM-powered inline code completions in Jupyter cells. */
  enabled: z.boolean().default(true),
  /** How code completions are triggered (auto while typing or manual shortcut). */
  triggerMode: z.enum(["auto", "manual"]).default("auto"),
  /** Debounce delay in milliseconds. */
  debounceMs: z.number().int().min(0).max(2000).default(200),
  /** Number of context blocks (-1 for entire document). */
  contextBlocks: z.number().int().min(-1).default(-1),
});

/** Schema for the `datalayer.completion.prosellm` settings group. */
export const proseLlmCompletionSettingsSchema = z.object({
  /** Toggle LLM-powered inline completions for prose and markdown content. */
  enabled: z.boolean().default(true),
  /** How prose completions are triggered (auto while typing or manual shortcut). */
  triggerMode: z.enum(["auto", "manual"]).default("manual"),
  /** Keyboard shortcut for manual trigger. */
  triggerKey: z.string().min(1).default("Cmd+Shift+,"),
  /** Debounce delay in milliseconds. */
  debounceMs: z.number().int().min(0).max(2000).default(500),
  /** Number of context blocks (-1 for entire document). */
  contextBlocks: z.number().int().min(-1).default(-1),
});

// ---------------------------------------------------------------------------
// Inferred types
// ---------------------------------------------------------------------------

/** Validated services settings. */
export type ServicesSettings = z.infer<typeof servicesSettingsSchema>;

/** Validated runtime settings. */
export type RuntimeSettings = z.infer<typeof runtimeSettingsSchema>;

/** Validated logging settings. */
export type LoggingSettings = z.infer<typeof loggingSettingsSchema>;

/** Validated auto-connect settings. */
export type AutoConnectSettings = z.infer<typeof autoConnectSettingsSchema>;

/** Validated onboarding settings. */
export type OnboardingSettings = z.infer<typeof onboardingSettingsSchema>;

/** Validated tools settings. */
export type ToolsSettings = z.infer<typeof toolsSettingsSchema>;

/** Validated pyodide settings. */
export type PyodideSettings = z.infer<typeof pyodideSettingsSchema>;

/** Validated inline LLM completion settings. */
export type InlineLlmCompletionSettings = z.infer<
  typeof inlineLlmCompletionSettingsSchema
>;

/** Validated prose LLM completion settings. */
export type ProseLlmCompletionSettings = z.infer<
  typeof proseLlmCompletionSettingsSchema
>;

/** All validated Datalayer extension settings. */
export interface DatalayerSettings {
  /** Service endpoint URLs. */
  services: ServicesSettings;
  /** Runtime configuration. */
  runtime: RuntimeSettings;
  /** Logging configuration. */
  logging: LoggingSettings;
  /** Auto-connect strategies. */
  autoConnect: AutoConnectSettings;
  /** Onboarding preferences. */
  onboarding: OnboardingSettings;
  /** MCP tool response format. */
  tools: ToolsSettings;
  /** Pyodide configuration. */
  pyodide: PyodideSettings;
  /** Inline LLM completion configuration. */
  inlineLlmCompletion: InlineLlmCompletionSettings;
  /** Prose LLM completion configuration. */
  proseLlmCompletion: ProseLlmCompletionSettings;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Log a warning about an invalid setting value.
 *
 * @param group - The settings group name (e.g. "services").
 * @param field - The specific setting key within the group.
 * @param issues - Human-readable description of the validation issues.
 */
function logValidationWarning(
  group: string,
  field: string,
  issues: string,
): void {
  if (ServiceLoggers.isInitialized()) {
    ServiceLoggers.main.warn(
      `Invalid setting datalayer.${group}.${field}: ${issues}. Using default value.`,
    );
  }
}

/**
 * Safely parse a VS Code configuration section against a Zod schema.
 * Returns validated values on success, or schema defaults on failure.
 * Individual field errors are logged as warnings.
 *
 * @param sectionName - The VS Code configuration section (e.g. "datalayer.services").
 * @param schema - The Zod schema to validate against.
 * @param groupLabel - Label used in warning messages (e.g. "services").
 *
 * @returns The validated and defaulted settings object.
 */
function validateSection<T extends z.ZodRawShape>(
  sectionName: string,
  schema: z.ZodObject<T>,
  groupLabel: string,
): z.infer<z.ZodObject<T>> {
  const config = vscode.workspace.getConfiguration(sectionName);

  // Extract raw values for every key the schema knows about.
  const raw: Record<string, unknown> = {};
  for (const key of Object.keys(schema.shape)) {
    const value = config.get(key);
    if (value !== undefined) {
      raw[key] = value;
    }
  }

  const result = schema.safeParse(raw);
  if (result.success) {
    return result.data;
  }

  // On partial failure, attempt field-by-field so valid fields are kept.
  // Zod issue paths can point to nested members/array elements (e.g.
  // "strategies.0"), but patched only stores top-level settings keys.
  // Remove the top-level setting so the schema default is used for that field.
  const patched: Record<string, unknown> = { ...raw };
  for (const issue of result.error.issues) {
    const field = issue.path.join(".");
    logValidationWarning(groupLabel, field, issue.message);

    const topLevelField = issue.path[0];
    if (
      typeof topLevelField === "string" ||
      typeof topLevelField === "number"
    ) {
      delete patched[String(topLevelField)];
    }
  }

  const retryResult = schema.safeParse(patched);
  if (retryResult.success) {
    return retryResult.data;
  }

  // Absolute fallback: return all defaults.
  return schema.parse({});
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Read and validate all Datalayer extension settings from VS Code workspace configuration.
 * Invalid values are replaced with safe defaults and warnings are logged.
 *
 * @returns A fully validated {@link DatalayerSettings} object with safe defaults for any invalid values.
 */
export function getValidatedSettings(): DatalayerSettings {
  return {
    services: validateSection(
      "datalayer.services",
      servicesSettingsSchema,
      "services",
    ),
    runtime: validateSection(
      "datalayer.runtime",
      runtimeSettingsSchema,
      "runtime",
    ),
    logging: validateSection(
      "datalayer.logging",
      loggingSettingsSchema,
      "logging",
    ),
    autoConnect: validateSection(
      "datalayer.autoConnect",
      autoConnectSettingsSchema,
      "autoConnect",
    ),
    onboarding: validateSection(
      "datalayer.onboarding",
      onboardingSettingsSchema,
      "onboarding",
    ),
    tools: validateSection("datalayer.tools", toolsSettingsSchema, "tools"),
    pyodide: validateSection(
      "datalayer.pyodide",
      pyodideSettingsSchema,
      "pyodide",
    ),
    inlineLlmCompletion: validateSection(
      "datalayer.completion.inlinellm",
      inlineLlmCompletionSettingsSchema,
      "completion.inlinellm",
    ),
    proseLlmCompletion: validateSection(
      "datalayer.completion.prosellm",
      proseLlmCompletionSettingsSchema,
      "completion.prosellm",
    ),
  };
}

/**
 * Validate a single settings group by name.
 * Useful when only a specific section is needed rather than all settings.
 *
 * @param group - The settings group to validate.
 *
 * @returns The validated settings for the requested group.
 */
export function getValidatedSettingsGroup<K extends keyof DatalayerSettings>(
  group: K,
): DatalayerSettings[K] {
  const mapping: Record<
    keyof DatalayerSettings,
    () => DatalayerSettings[keyof DatalayerSettings]
  > = {
    services: () =>
      validateSection("datalayer.services", servicesSettingsSchema, "services"),
    runtime: () =>
      validateSection("datalayer.runtime", runtimeSettingsSchema, "runtime"),
    logging: () =>
      validateSection("datalayer.logging", loggingSettingsSchema, "logging"),
    autoConnect: () =>
      validateSection(
        "datalayer.autoConnect",
        autoConnectSettingsSchema,
        "autoConnect",
      ),
    onboarding: () =>
      validateSection(
        "datalayer.onboarding",
        onboardingSettingsSchema,
        "onboarding",
      ),
    tools: () =>
      validateSection("datalayer.tools", toolsSettingsSchema, "tools"),
    pyodide: () =>
      validateSection("datalayer.pyodide", pyodideSettingsSchema, "pyodide"),
    inlineLlmCompletion: () =>
      validateSection(
        "datalayer.completion.inlinellm",
        inlineLlmCompletionSettingsSchema,
        "completion.inlinellm",
      ),
    proseLlmCompletion: () =>
      validateSection(
        "datalayer.completion.prosellm",
        proseLlmCompletionSettingsSchema,
        "completion.prosellm",
      ),
  };

  return mapping[group]() as DatalayerSettings[K];
}
