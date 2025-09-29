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

import React, { useState, useEffect, useMemo, useContext } from "react";
import { MessageHandlerContext } from "../services/messageHandler";
import type { RuntimeJSON } from "@datalayer/core/lib/sdk/client/models/Runtime";

interface RuntimeProgressBarProps {
  runtime: RuntimeJSON | undefined;
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
  const messageHandler = useContext(MessageHandlerContext);
  const [percentage, setPercentage] = useState(100);
  const [isExpired, setIsExpired] = useState(false);

  // Calculate initial time remaining and total duration
  const { initialSeconds, totalSeconds } = useMemo(() => {
    if (!runtime || !isDatalayerRuntime) {
      return { initialSeconds: 0, totalSeconds: 3600 };
    }

    console.log(
      "[RuntimeProgressBar] Processing runtime data for progress calculation"
    );
    console.log(
      "[RuntimeProgressBar] Runtime object:",
      JSON.stringify(runtime, null, 2)
    );

    // If we have expires_at and started_at, calculate both remaining and total
    if (runtime.expires_at && runtime.started_at) {
      const now = Date.now();
      const nowUTC = new Date().toISOString();

      console.log("[RuntimeProgressBar] Time calculations:");
      console.log("  - Current time (UTC):", nowUTC);
      console.log("  - Current time (timestamp):", now);
      console.log("  - Raw started_at:", runtime.started_at);
      console.log("  - Raw expires_at:", runtime.expires_at);

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

      console.log("  - Parsed started_at (timestamp):", startedAt);
      console.log(
        "  - Parsed started_at (UTC):",
        new Date(startedAt).toISOString()
      );
      console.log("  - Parsed expires_at (timestamp):", expiresAt);
      console.log(
        "  - Parsed expires_at (UTC):",
        new Date(expiresAt).toISOString()
      );

      // Total duration from start to expiry
      const totalDuration = Math.floor((expiresAt - startedAt) / 1000);
      // Time remaining from now to expiry
      const remaining = Math.max(0, Math.floor((expiresAt - now) / 1000));

      console.log("  - Total duration (seconds):", totalDuration);
      console.log(
        "  - Total duration (minutes):",
        Math.round((totalDuration / 60) * 100) / 100
      );
      console.log("  - Time remaining (seconds):", remaining);
      console.log(
        "  - Time remaining (minutes):",
        Math.round((remaining / 60) * 100) / 100
      );
      console.log("  - Time elapsed (seconds):", totalDuration - remaining);
      console.log(
        "  - Time elapsed (minutes):",
        Math.round(((totalDuration - remaining) / 60) * 100) / 100
      );

      console.log("[RuntimeProgressBar] Time calculation completed");

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
      console.log(
        "[RuntimeProgressBar] No runtime or expired, setting progress to 100%"
      );
      setPercentage(100); // When no time left, bar is full
      return;
    }

    // Calculate initial percentage (how much time has been used)
    const elapsedSeconds = totalSeconds - initialSeconds;
    const initialPercentage =
      totalSeconds > 0 ? (elapsedSeconds / totalSeconds) * 100 : 0;

    console.log("[RuntimeProgressBar] Progress bar initialization:");
    console.log("  - Initial seconds remaining:", initialSeconds);
    console.log("  - Total seconds:", totalSeconds);
    console.log("  - Elapsed seconds:", elapsedSeconds);
    console.log("  - Initial percentage:", initialPercentage);

    setPercentage(Math.max(0, Math.min(100, initialPercentage)));

    let currentSeconds = initialSeconds;

    const interval = setInterval(() => {
      currentSeconds = Math.max(0, currentSeconds - 1);

      // Calculate percentage based on elapsed time (fills as time passes)
      const elapsed = totalSeconds - currentSeconds;
      const pct = totalSeconds > 0 ? (elapsed / totalSeconds) * 100 : 100;

      // Debug every 10 seconds to see progress
      if (currentSeconds % 10 === 0) {
        console.log("[RuntimeProgressBar] Progress update:");
        console.log("  - Current seconds remaining:", currentSeconds);
        console.log("  - Elapsed seconds:", elapsed);
        console.log("  - Percentage:", pct);
        console.log(
          "  - Time remaining (MM:SS):",
          Math.floor(currentSeconds / 60) +
            ":" +
            (currentSeconds % 60).toString().padStart(2, "0")
        );
      }

      setPercentage(Math.max(0, Math.min(100, pct)));

      if (currentSeconds === 0 && !isExpired) {
        console.log(
          "[RuntimeProgressBar] Runtime expired! Sending runtime-expired message"
        );
        console.log(
          "[RuntimeProgressBar] Runtime object:",
          JSON.stringify(runtime, null, 2)
        );

        setIsExpired(true);

        // Post message to extension that runtime expired
        if (messageHandler) {
          const expiredMessage = {
            type: "runtime-expired",
            body: { runtime: runtime }, // Make sure runtime is in body like other messages
          };
          console.log(
            "[RuntimeProgressBar] Sending runtime-expired message:",
            expiredMessage
          );
          messageHandler.postMessage(expiredMessage);
          console.log(
            "[RuntimeProgressBar] Runtime-expired message sent successfully via MessageHandler"
          );
        } else {
          console.error(
            "[RuntimeProgressBar] MessageHandler not available for runtime expiration message"
          );
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
