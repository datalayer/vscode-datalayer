/*
 * Copyright (c) 2021-2025 Datalayer, Inc.
 *
 * MIT License
 */

/**
 * @module InsertLinkDialog
 * Dialog for inserting/editing links in the editor.
 */

import React, { useState } from "react";

export interface InsertLinkDialogProps {
  initialText?: string;
  initialUrl?: string;
  onInsert: (url: string, text: string) => void;
  onClose: () => void;
}

/**
 * Dialog for inserting or editing hyperlinks.
 */
export const InsertLinkDialog: React.FC<InsertLinkDialogProps> = ({
  initialText = "",
  initialUrl = "https://",
  onInsert,
  onClose,
}) => {
  const [text, setText] = useState(initialText);
  const [url, setUrl] = useState(initialUrl);
  const [error, setError] = useState("");

  const handleInsert = () => {
    if (!url || url === "https://") {
      setError("Please enter a valid URL");
      return;
    }

    if (!text) {
      setError("Please enter link text");
      return;
    }

    onInsert(url, text);
    onClose();
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
        Insert Link
      </h2>

      <div style={{ marginBottom: "12px" }}>
        <label
          htmlFor="link-text"
          style={{
            display: "block",
            marginBottom: "6px",
            fontSize: "13px",
            color: "var(--vscode-foreground)",
          }}
        >
          Link Text
        </label>
        <input
          id="link-text"
          type="text"
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            setError("");
          }}
          onKeyDown={handleKeyDown}
          placeholder="Enter link text"
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
      </div>

      <div style={{ marginBottom: "12px" }}>
        <label
          htmlFor="link-url"
          style={{
            display: "block",
            marginBottom: "6px",
            fontSize: "13px",
            color: "var(--vscode-foreground)",
          }}
        >
          URL
        </label>
        <input
          id="link-url"
          type="text"
          value={url}
          onChange={(e) => {
            setUrl(e.target.value);
            setError("");
          }}
          onKeyDown={handleKeyDown}
          placeholder="https://example.com"
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
          display: "flex",
          justifyContent: "flex-end",
          gap: "8px",
          marginTop: "16px",
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
          disabled={!url || !text}
          style={{
            padding: "6px 14px",
            fontSize: "13px",
            backgroundColor:
              url && text
                ? "var(--vscode-button-background)"
                : "var(--vscode-button-secondaryBackground)",
            color:
              url && text
                ? "var(--vscode-button-foreground)"
                : "var(--vscode-button-secondaryForeground)",
            border: "none",
            borderRadius: "2px",
            cursor: url && text ? "pointer" : "not-allowed",
            opacity: url && text ? 1 : 0.6,
          }}
        >
          Insert
        </button>
      </div>
    </div>
  );
};
