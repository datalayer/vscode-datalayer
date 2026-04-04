/// <reference types="vitest/globals" />

/*
 * Copyright (c) 2021-2025 Datalayer, Inc.
 *
 * MIT License
 */

import { fireEvent, render, screen } from "@testing-library/react";
import React from "react";

import { ErrorBoundary } from "../components/ErrorBoundary";

// Component that throws on render for testing
function ThrowingComponent({ shouldThrow }: { shouldThrow: boolean }) {
  if (shouldThrow) {
    throw new Error("Test rendering error");
  }
  return React.createElement("div", null, "Child content works");
}

describe("ErrorBoundary", () => {
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    // Suppress React error boundary console noise during tests
    consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
  });

  it("renders children when there is no error", () => {
    render(
      React.createElement(
        ErrorBoundary,
        { editorName: "Test Editor" },
        React.createElement("div", null, "Hello World"),
      ),
    );

    expect(screen.getByText("Hello World")).toBeDefined();
  });

  it("shows error UI when a child component throws", () => {
    render(
      React.createElement(
        ErrorBoundary,
        { editorName: "Notebook Editor" },
        React.createElement(ThrowingComponent, { shouldThrow: true }),
      ),
    );

    expect(
      screen.getByText("Something went wrong in the Notebook Editor."),
    ).toBeDefined();
    expect(screen.getByText("Test rendering error")).toBeDefined();
    expect(screen.getByText("Try Again")).toBeDefined();
  });

  it("displays the editor name in the error message", () => {
    render(
      React.createElement(
        ErrorBoundary,
        { editorName: "Lexical Editor" },
        React.createElement(ThrowingComponent, { shouldThrow: true }),
      ),
    );

    expect(
      screen.getByText("Something went wrong in the Lexical Editor."),
    ).toBeDefined();
  });

  it("logs error details via componentDidCatch", () => {
    render(
      React.createElement(
        ErrorBoundary,
        { editorName: "Test Editor" },
        React.createElement(ThrowingComponent, { shouldThrow: true }),
      ),
    );

    // componentDidCatch calls console.error with the editor name prefix
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      "[Test Editor] Rendering error:",
      expect.any(Error),
      expect.any(String),
    );
  });

  it("resets error state when 'Try Again' button is clicked", () => {
    const { rerender } = render(
      React.createElement(
        ErrorBoundary,
        { editorName: "Test Editor" },
        React.createElement(ThrowingComponent, { shouldThrow: true }),
      ),
    );

    // Error UI should be visible
    expect(screen.getByText("Try Again")).toBeDefined();

    // Re-render with non-throwing child before clicking reset
    rerender(
      React.createElement(
        ErrorBoundary,
        { editorName: "Test Editor" },
        React.createElement(ThrowingComponent, { shouldThrow: false }),
      ),
    );

    fireEvent.click(screen.getByText("Try Again"));

    // After reset, children should render normally
    expect(screen.getByText("Child content works")).toBeDefined();
  });

  it("shows the Try Again button as a button element", () => {
    render(
      React.createElement(
        ErrorBoundary,
        { editorName: "Test Editor" },
        React.createElement(ThrowingComponent, { shouldThrow: true }),
      ),
    );

    const button = screen.getByText("Try Again");
    expect(button.tagName).toBe("BUTTON");
  });
});
