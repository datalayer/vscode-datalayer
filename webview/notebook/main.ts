/*
 * Copyright (c) 2021-2025 Datalayer, Inc.
 *
 * MIT License
 */

/**
 * @module main
 * Entry point for the webview application.
 * Initializes the React-based notebook editor in the webview context.
 */

import * as l10n from "@vscode/l10n";

// Initialize l10n with the bundle injected by the extension host.
// The bundle is an empty object when running with the default English locale.
declare const window: Window & { __l10nBundle__?: Record<string, string> };
l10n.config({ contents: window.__l10nBundle__ ?? {} });

import "./NotebookEditor";

import { setStylesTarget } from "typestyle";

import { getNonce } from "../utils";

// Fix to apply styled-components style should be set directly at the entry point start.
// Xref: https://github.com/styled-components/styled-components/issues/4258#issuecomment-2449562515
// @ts-ignore - webpack global variable
__webpack_nonce__ = getNonce() || "";

// Fix to apply typestyle styles
// Xref: https://github.com/typestyle/typestyle/pull/267#issuecomment-390408796
setStylesTarget(document.querySelector("#typestyle-stylesheet")!);
