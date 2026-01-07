/*
 * Copyright (c) 2021-2025 Datalayer, Inc.
 *
 * MIT License
 */

/**
 * Returns CSS that maps VS Code CSS variables to Primer CSS variables.
 * This ensures Primer React components match the active VS Code theme.
 *
 * @returns CSS string with variable overrides
 */
export function getPrimerVSCodeThemeCSS(): string {
  return `
    /* CRITICAL: Override Primer colors with VSCode CSS variables using !important */
    :root {
      /* Base colors */
      --bgColor-default: var(--vscode-editor-background) !important;
      --fgColor-default: var(--vscode-editor-foreground) !important;
      --fgColor-muted: var(--vscode-descriptionForeground) !important;
      --bgColor-muted: var(--vscode-editorWidget-background) !important;
      --borderColor-default: var(--vscode-panel-border) !important;

      /* Button variant colors - Default */
      --button-default-bgColor-rest: var(--vscode-button-secondaryBackground) !important;
      --button-default-bgColor-hover: var(--vscode-button-secondaryHoverBackground) !important;
      --button-default-fgColor-rest: var(--vscode-button-secondaryForeground) !important;
      --button-default-borderColor-rest: var(--vscode-button-border) !important;

      /* Button variant colors - Primary */
      --button-primary-bgColor-rest: var(--vscode-button-background) !important;
      --button-primary-bgColor-hover: var(--vscode-button-hoverBackground) !important;
      --button-primary-fgColor-rest: var(--vscode-button-foreground) !important;
      --button-primary-borderColor-rest: var(--vscode-button-border) !important;

      /* Button variant colors - Danger */
      --button-danger-bgColor-rest: transparent !important;
      --button-danger-bgColor-hover: var(--vscode-errorForeground) !important;
      --button-danger-fgColor-rest: var(--vscode-errorForeground) !important;
      --button-danger-fgColor-hover: var(--vscode-button-foreground) !important;
      --button-danger-borderColor-rest: var(--vscode-errorForeground) !important;

      /* Use VS Code's subtle rounded corners */
      --borderRadius-small: 2px !important;
      --borderRadius-medium: 2px !important;
      --borderRadius-large: 2px !important;

      /* Flash/Banner colors - critical for warning banners */
      --bgColor-success-muted: color-mix(in srgb, var(--vscode-testing-iconPassed) 15%, transparent) !important;
      --fgColor-success: var(--vscode-testing-iconPassed) !important;
      --borderColor-success-muted: var(--vscode-testing-iconPassed) !important;

      --bgColor-danger-muted: color-mix(in srgb, var(--vscode-errorForeground) 15%, transparent) !important;
      --fgColor-danger: var(--vscode-errorForeground) !important;
      --borderColor-danger-muted: var(--vscode-errorForeground) !important;
      --borderColor-danger-emphasis: var(--vscode-errorForeground) !important;

      --bgColor-attention-muted: color-mix(in srgb, var(--vscode-editorWarning-foreground) 15%, transparent) !important;
      --fgColor-attention: var(--vscode-editorWarning-foreground) !important;
      --borderColor-attention-muted: var(--vscode-editorWarning-foreground) !important;
      --borderColor-attention-emphasis: var(--vscode-editorWarning-foreground) !important;

      /* Form controls - inputs, textareas, selects */
      --control-bgColor-rest: var(--vscode-input-background) !important;
      --control-fgColor-rest: var(--vscode-input-foreground) !important;
      --control-borderColor-rest: var(--vscode-input-border) !important;
      --control-borderColor-emphasis: var(--vscode-focusBorder) !important;
      --control-fgColor-placeholder: var(--vscode-input-placeholderForeground) !important;

      /* Override Primer's control sizing */
      --control-medium-size: 32px !important;
      --control-medium-paddingBlock: 6px !important;
      --control-medium-paddingInline-normal: 8px !important;

      /* Label colors */
      --bgColor-success-emphasis: var(--vscode-testing-iconPassed) !important;

      /* Progress bar */
      --progressBar-bgColor: var(--vscode-testing-iconPassed) !important;
    }

    /* Direct styling for form inputs to ensure proper borders and backgrounds */
    input[type="text"],
    input:not([type]),
    textarea,
    select {
      background-color: var(--vscode-input-background) !important;
      color: var(--vscode-input-foreground) !important;
      border: 1px solid var(--vscode-input-border) !important;
      border-radius: 2px !important;
      padding: 5px 8px !important;
      font-family: var(--vscode-font-family) !important;
      font-size: var(--vscode-font-size) !important;
      line-height: 20px !important;
      min-height: 26px !important;
      box-shadow: none !important;
    }

    input[type="text"]:focus,
    input:not([type]):focus,
    textarea:focus,
    select:focus {
      outline: 1px solid var(--vscode-focusBorder) !important;
      outline-offset: -1px;
      border-color: var(--vscode-focusBorder) !important;
      box-shadow: none !important;
    }

    input[type="text"]:hover,
    input:not([type]):hover,
    textarea:hover,
    select:hover {
      border-color: var(--vscode-input-border) !important;
    }

    input[type="text"]::placeholder,
    textarea::placeholder {
      color: var(--vscode-input-placeholderForeground) !important;
      opacity: 1 !important;
    }

    /* Primer's TextInput component - override all internal styling */
    .TextInput-wrapper,
    .FormControl-input-wrap {
      background-color: var(--vscode-input-background) !important;
      border: 1px solid var(--vscode-input-border) !important;
      border-radius: 2px !important;
      box-shadow: none !important;
      min-height: 26px !important;
    }

    .TextInput-wrapper input,
    .FormControl-input-wrap input {
      background-color: transparent !important;
      color: var(--vscode-input-foreground) !important;
      border: none !important;
      font-family: var(--vscode-font-family) !important;
      font-size: var(--vscode-font-size) !important;
      padding: 5px 8px !important;
      line-height: 20px !important;
      box-shadow: none !important;
    }

    .TextInput-wrapper:focus-within,
    .FormControl-input-wrap:focus-within {
      outline: 1px solid var(--vscode-focusBorder) !important;
      outline-offset: -1px;
      border-color: var(--vscode-focusBorder) !important;
      box-shadow: none !important;
    }

    /* Primer's Textarea */
    .Textarea,
    textarea.FormControl-textarea {
      background-color: var(--vscode-input-background) !important;
      color: var(--vscode-input-foreground) !important;
      border: 1px solid var(--vscode-input-border) !important;
      border-radius: 2px !important;
      padding: 5px 8px !important;
      font-family: var(--vscode-font-family) !important;
      font-size: var(--vscode-font-size) !important;
      line-height: 20px !important;
      box-shadow: none !important;
    }

    /* Primer's Select */
    .FormControl-select,
    select {
      background-color: var(--vscode-input-background) !important;
      color: var(--vscode-input-foreground) !important;
      border: 1px solid var(--vscode-input-border) !important;
      border-radius: 2px !important;
      padding: 5px 8px !important;
      font-family: var(--vscode-font-family) !important;
      font-size: var(--vscode-font-size) !important;
      line-height: 20px !important;
      min-height: 26px !important;
      box-shadow: none !important;
    }

    /* Form control containers should not have extra backgrounds */
    .FormControl {
      background: transparent !important;
    }

    /* Labels should use VS Code foreground */
    .FormControl-label {
      color: var(--vscode-foreground) !important;
      font-family: var(--vscode-font-family) !important;
      font-size: var(--vscode-font-size) !important;
    }

    /* Caption text should use muted color */
    .FormControl-caption {
      color: var(--vscode-descriptionForeground) !important;
      font-size: calc(var(--vscode-font-size) - 1px) !important;
    }

    /* Buttons - ensure subtle rounded corners and VS Code styling */
    button,
    .Button {
      border-radius: 2px !important;
      font-family: var(--vscode-font-family) !important;
      font-size: var(--vscode-font-size) !important;
      box-shadow: none !important;
    }

    /* Primary button - border color matches VS Code */
    .Button--primary {
      border: 1px solid var(--vscode-button-border) !important;
    }

    /* Secondary/Default button - border color matches VS Code */
    .Button--default,
    .Button--secondary {
      border: 1px solid var(--vscode-button-border) !important;
    }

    /* Danger button - border color matches VS Code */
    .Button--danger {
      border: 1px solid var(--vscode-button-border) !important;
    }

    button:focus,
    .Button:focus {
      outline: 1px solid var(--vscode-focusBorder) !important;
      outline-offset: -1px;
    }

    /* Flash/Alert components - inline layout with icon */
    .Flash {
      border-radius: 2px !important;
      display: flex !important;
      flex-direction: row !important;
      align-items: center !important;
      gap: 8px !important;
    }

    .Flash > svg {
      flex-shrink: 0 !important;
    }
  `;
}
