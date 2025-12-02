/*
 * Copyright (c) 2021-2025 Datalayer, Inc.
 *
 * MIT License
 */

/**
 * Shared kernel selector component used by both Notebook and Lexical toolbars.
 * Ensures consistent appearance and behavior across all editors.
 *
 * @module components/toolbar/KernelSelector
 */

import React from "react";
import { ToolbarButton } from "./ToolbarButton";
import type { RuntimeJSON } from "@datalayer/core/lib/client";
import { isLocalKernelUrl } from "../../../src/constants/kernelConstants";

export interface KernelSelectorProps {
  /** Currently selected Datalayer runtime */
  selectedRuntime?: RuntimeJSON;
  /** Kernel name (for native Jupyter kernels) */
  kernelName?: string;
  /** Kernel status for loading indicator */
  kernelStatus?: "idle" | "busy" | "disconnected";
  /** Click handler to open kernel selection dialog */
  onClick: () => void;
  /** Whether the selector is disabled */
  disabled?: boolean;
}

/**
 * Kernel selector button component.
 *
 * Display logic:
 * - If selectedRuntime exists and is a cloud runtime: "Datalayer: {runtimeName}"
 * - If selectedRuntime exists and is Pyodide or local kernel: "{runtimeName}" (no prefix)
 * - If kernelName exists: "{kernelName}"
 * - Otherwise: "Select Kernel"
 *
 * Icon:
 * - Loading spinner when kernelStatus is "busy"
 * - Server environment icon otherwise
 *
 * Position: Always on the RIGHT side of the toolbar
 * No dropdown arrow indicator (clean button appearance)
 * Clickable only when disconnected or to change runtime
 */
export const KernelSelector: React.FC<KernelSelectorProps> = ({
  selectedRuntime,
  kernelName,
  kernelStatus,
  onClick,
  disabled = false,
}) => {
  const getKernelText = () => {
    if (selectedRuntime) {
      const runtimeName =
        selectedRuntime.givenName ||
        selectedRuntime.environmentTitle ||
        selectedRuntime.environmentName ||
        selectedRuntime.uid ||
        "Runtime";
      // Check if this is a local kernel or Pyodide (both should not have "Datalayer: " prefix)
      const isPyodide = selectedRuntime.ingress === "http://pyodide-local";
      const isLocalKernel = selectedRuntime.ingress
        ? isLocalKernelUrl(selectedRuntime.ingress)
        : false;
      // Don't show "Datalayer: " prefix for local kernels or Pyodide
      return isPyodide || isLocalKernel
        ? runtimeName
        : `Datalayer: ${runtimeName}`;
    }
    if (kernelName) {
      return kernelName;
    }
    return "Select Kernel";
  };

  const getKernelIcon = () => {
    if (kernelStatus === "busy") {
      return "codicon codicon-loading codicon-modifier-spin";
    }
    return "codicon codicon-server-environment";
  };

  const isLoading = kernelStatus === "busy";

  return (
    <ToolbarButton
      icon={getKernelIcon()}
      label={getKernelText()}
      onClick={onClick}
      disabled={disabled}
      loading={isLoading}
      title={
        selectedRuntime
          ? `Change runtime (current: ${getKernelText()})`
          : "Select a Datalayer runtime or Jupyter kernel"
      }
    />
  );
};
