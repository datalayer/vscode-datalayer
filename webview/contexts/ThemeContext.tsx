/*
 * Copyright (c) 2021-2025 Datalayer, Inc.
 *
 * MIT License
 */

/**
 * Theme provider for VS Code that provides theme to jupyter-lexical components.
 * Re-exports ThemeContext from jupyter-lexical and provides a VS Code-specific provider.
 *
 * @module contexts/ThemeContext
 */

import React, { type ReactNode } from "react";
import { ThemeContext, type ThemeType } from "@datalayer/jupyter-lexical";

export type { ThemeType };

export interface ThemeProviderProps {
  theme: ThemeType;
  children: ReactNode;
}

/**
 * Theme provider component that makes the VS Code theme available to all child components.
 * Provides the jupyter-lexical ThemeContext so components in that package can consume it.
 *
 * @example
 * ```tsx
 * <ThemeProvider theme={theme}>
 *   <LexicalEditor {...props} />
 * </ThemeProvider>
 * ```
 */
export function ThemeProvider({ theme, children }: ThemeProviderProps) {
  return (
    <ThemeContext.Provider value={{ theme }}>{children}</ThemeContext.Provider>
  );
}
