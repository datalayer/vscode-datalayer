/*
 * Copyright (c) 2021-2023 Datalayer, Inc.
 *
 * MIT License
 */

/**
 * Runtime progress bar component showing remaining time for Datalayer runtimes.
 * Displays as a thin colored line at the top of the notebook that depletes over time.
 *
 * @module notebook/RuntimeProgressBar
 */

import React, { useState, useEffect, useMemo } from "react";

declare global {
  interface Window {
    vscode?: {
      postMessage: (message: any) => void;
    };
  }
}

interface RuntimeInfo {
  uid: string;
  name: string;
  url: string;
  token: string;
  status: string;
  environment_name?: string;
  started_at?: string;
  expires_at?: string;
  credits?: number;
}

interface RuntimeProgressBarProps {
  runtime: RuntimeInfo | undefined;
  isDatalayerRuntime: boolean;
}

/**
 * Displays a progress bar showing remaining runtime credits.
 * Changes color from blue to yellow to red as time runs out.
 */
export function RuntimeProgressBar({
  runtime,
  isDatalayerRuntime,
}: RuntimeProgressBarProps) {
  const [percentage, setPercentage] = useState(100);
  const [isExpired, setIsExpired] = useState(false);

  // Calculate initial time remaining and total duration
  const { initialSeconds, totalSeconds } = useMemo(() => {
    if (!runtime || !isDatalayerRuntime) {
      return { initialSeconds: 0, totalSeconds: 3600 };
    }

    // Processing runtime data for progress calculation

    // If we have expires_at and started_at, calculate both remaining and total
    if (runtime.expires_at && runtime.started_at) {
      const now = Date.now();

      // Parse Unix timestamps (in seconds, potentially as strings)
      const expiresAt =
        typeof runtime.expires_at === "string" &&
        !runtime.expires_at.includes("-")
          ? parseFloat(runtime.expires_at) * 1000 // Unix timestamp in seconds
          : new Date(runtime.expires_at).getTime();

      const startedAt =
        typeof runtime.started_at === "string" &&
        !runtime.started_at.includes("-")
          ? parseFloat(runtime.started_at) * 1000 // Unix timestamp in seconds
          : new Date(runtime.started_at).getTime();

      // Total duration from start to expiry
      const totalDuration = Math.floor((expiresAt - startedAt) / 1000);
      // Time remaining from now to expiry
      const remaining = Math.max(0, Math.floor((expiresAt - now) / 1000));

      // Time calculation completed

      return { initialSeconds: remaining, totalSeconds: totalDuration };
    }

    // Fallback: If only started_at is available, assume 10 credits default runtime
    if (runtime.started_at) {
      const now = Date.now();

      // Parse Unix timestamp
      const startedAt =
        typeof runtime.started_at === "string" &&
        !runtime.started_at.includes("-")
          ? parseFloat(runtime.started_at) * 1000 // Unix timestamp in seconds
          : new Date(runtime.started_at).getTime();

      // Default runtime: 10 credits = 60 minutes = 3600 seconds
      const defaultTotalSeconds = 10 * 360;
      const elapsed = Math.floor((now - startedAt) / 1000);
      const remaining = Math.max(0, defaultTotalSeconds - elapsed);

      // Fallback calculation using started_at timestamp

      return { initialSeconds: remaining, totalSeconds: defaultTotalSeconds };
    }

    // Default fallback: 10 credits = 1 hour
    // Using default 10 credits fallback
    const defaultTotal = 10 * 360; // 3600 seconds
    return { initialSeconds: defaultTotal, totalSeconds: defaultTotal };
  }, [runtime, isDatalayerRuntime]);

  // Set up countdown timer
  useEffect(() => {
    if (!runtime || !isDatalayerRuntime || initialSeconds <= 0) {
      setPercentage(100); // When no time left, bar is full
      return;
    }

    // Calculate initial percentage (how much time has been used)
    const elapsedSeconds = totalSeconds - initialSeconds;
    const initialPercentage =
      totalSeconds > 0 ? (elapsedSeconds / totalSeconds) * 100 : 0;
    setPercentage(Math.max(0, Math.min(100, initialPercentage)));

    let currentSeconds = initialSeconds;

    const interval = setInterval(() => {
      currentSeconds = Math.max(0, currentSeconds - 1);

      // Calculate percentage based on elapsed time (fills as time passes)
      const elapsed = totalSeconds - currentSeconds;
      const pct = totalSeconds > 0 ? (elapsed / totalSeconds) * 100 : 100;
      setPercentage(Math.max(0, Math.min(100, pct)));

      if (currentSeconds === 0 && !isExpired) {
        setIsExpired(true);
        // Post message to extension that runtime expired
        if (window.vscode) {
          window.vscode.postMessage({
            type: "runtime-expired",
            runtime: runtime,
          });
        }
        clearInterval(interval);
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [runtime, isDatalayerRuntime, initialSeconds, totalSeconds, isExpired]);

  // Don't show bar for non-Datalayer runtimes or if no runtime selected
  if (!runtime || !isDatalayerRuntime) {
    return null;
  }

  // Determine bar color based on used percentage - using VS Code theme colors
  const getBarColor = () => {
    if (percentage >= 100)
      return "var(--vscode-notificationsErrorIcon-foreground, var(--vscode-errorForeground))";
    if (percentage > 90)
      return "var(--vscode-editorError-foreground, var(--vscode-errorForeground))";
    if (percentage > 70)
      return "var(--vscode-editorWarning-foreground, var(--vscode-warningForeground))";
    return "var(--vscode-progressBar-background, var(--vscode-button-background))"; // Uses the theme's primary accent color
  };

  return (
    <>
      {/* Progress bar container */}
      <div
        style={{
          position: "fixed",
          top: 0,
          left: 0,
          right: 0,
          height: "3px",
          backgroundColor:
            "var(--vscode-editor-inactiveSelectionBackground, var(--vscode-editor-selectionBackground))",
          opacity: 0.3,
          zIndex: 10000,
          boxShadow: "0 1px 2px rgba(0,0,0,0.1)",
        }}
      >
        {/* Animated progress indicator */}
        <div
          style={{
            height: "100%",
            width: `${percentage}%`,
            backgroundColor: getBarColor(),
            transition: "width 1s linear, background-color 0.3s ease",
            boxShadow: percentage > 70 ? `0 0 10px ${getBarColor()}` : "none",
            position: "relative",
          }}
        >
          {/* Pulse animation for low time warning */}
          {percentage > 90 && percentage < 100 && (
            <div
              style={{
                position: "absolute",
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
                backgroundColor: "inherit",
                animation: "pulse 2s infinite",
              }}
            />
          )}
        </div>
      </div>

      {/* No overlay when expired - let the extension handle it with notifications */}

      {/* CSS for pulse animation */}
      <style>{`
        @keyframes pulse {
          0% { opacity: 1; }
          50% { opacity: 0.6; }
          100% { opacity: 1; }
        }
      `}</style>
    </>
  );
}
