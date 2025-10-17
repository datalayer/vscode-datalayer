/*
 * Copyright (c) 2021-2025 Datalayer, Inc.
 *
 * MIT License
 */

/**
 * @module InsertYouTubeDialog
 * Dialog for inserting YouTube videos into the editor.
 */

import React, { useState } from "react";

export interface InsertYouTubeDialogProps {
  onInsert: (videoId: string) => void;
  onClose: () => void;
}

/**
 * Dialog for inserting YouTube videos.
 * Accepts various YouTube URL formats and extracts the video ID.
 */
export const InsertYouTubeDialog: React.FC<InsertYouTubeDialogProps> = ({
  onInsert,
  onClose,
}) => {
  const [url, setUrl] = useState("");
  const [error, setError] = useState("");

  const extractVideoId = (input: string): string | null => {
    if (!input) return null;

    try {
      const urlObj = new URL(input);

      // Standard format: youtube.com/watch?v=VIDEO_ID
      if (
        urlObj.hostname.includes("youtube.com") &&
        urlObj.searchParams.has("v")
      ) {
        return urlObj.searchParams.get("v");
      }
      // Short format: youtu.be/VIDEO_ID
      else if (urlObj.hostname === "youtu.be") {
        return urlObj.pathname.slice(1);
      }
      // Embed format: youtube.com/embed/VIDEO_ID
      else if (urlObj.pathname.startsWith("/embed/")) {
        return urlObj.pathname.split("/embed/")[1];
      }
    } catch (e) {
      // If URL parsing fails, check if it's just a video ID
      if (/^[a-zA-Z0-9_-]{11}$/.test(input)) {
        return input;
      }
    }

    return null;
  };

  const handleInsert = () => {
    const videoId = extractVideoId(url);
    if (videoId) {
      onInsert(videoId);
      onClose();
    } else {
      setError("Invalid YouTube URL or video ID");
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      handleInsert();
    } else if (e.key === "Escape") {
      onClose();
    }
  };

  return (
    <div
      style={{
        padding: "20px",
        minWidth: "400px",
      }}
    >
      <h2
        style={{
          margin: "0 0 16px 0",
          fontSize: "16px",
          fontWeight: "600",
          color: "var(--vscode-foreground)",
        }}
      >
        Insert YouTube Video
      </h2>

      <div style={{ marginBottom: "12px" }}>
        <label
          htmlFor="youtube-url"
          style={{
            display: "block",
            marginBottom: "6px",
            fontSize: "13px",
            color: "var(--vscode-foreground)",
          }}
        >
          YouTube URL or Video ID
        </label>
        <input
          id="youtube-url"
          type="text"
          value={url}
          onChange={(e) => {
            setUrl(e.target.value);
            setError("");
          }}
          onKeyDown={handleKeyDown}
          placeholder="https://www.youtube.com/watch?v=..."
          autoFocus
          style={{
            width: "100%",
            padding: "6px 8px",
            fontSize: "13px",
            backgroundColor: "var(--vscode-input-background)",
            color: "var(--vscode-input-foreground)",
            border: "1px solid var(--vscode-input-border)",
            borderRadius: "2px",
            outline: "none",
          }}
        />
        {error && (
          <div
            style={{
              marginTop: "6px",
              fontSize: "12px",
              color: "var(--vscode-errorForeground)",
            }}
          >
            {error}
          </div>
        )}
      </div>

      <div
        style={{
          fontSize: "12px",
          color: "var(--vscode-descriptionForeground)",
          marginBottom: "16px",
        }}
      >
        Supported formats:
        <ul style={{ margin: "4px 0", paddingLeft: "20px" }}>
          <li>https://www.youtube.com/watch?v=VIDEO_ID</li>
          <li>https://youtu.be/VIDEO_ID</li>
          <li>https://www.youtube.com/embed/VIDEO_ID</li>
          <li>VIDEO_ID (11 characters)</li>
        </ul>
      </div>

      <div
        style={{
          display: "flex",
          justifyContent: "flex-end",
          gap: "8px",
        }}
      >
        <button
          onClick={onClose}
          style={{
            padding: "6px 14px",
            fontSize: "13px",
            backgroundColor: "var(--vscode-button-secondaryBackground)",
            color: "var(--vscode-button-secondaryForeground)",
            border: "none",
            borderRadius: "2px",
            cursor: "pointer",
          }}
        >
          Cancel
        </button>
        <button
          onClick={handleInsert}
          disabled={!url}
          style={{
            padding: "6px 14px",
            fontSize: "13px",
            backgroundColor: url
              ? "var(--vscode-button-background)"
              : "var(--vscode-button-secondaryBackground)",
            color: url
              ? "var(--vscode-button-foreground)"
              : "var(--vscode-button-secondaryForeground)",
            border: "none",
            borderRadius: "2px",
            cursor: url ? "pointer" : "not-allowed",
            opacity: url ? 1 : 0.6,
          }}
        >
          Insert
        </button>
      </div>
    </div>
  );
};
