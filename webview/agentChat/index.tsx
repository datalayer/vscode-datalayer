/*
 * Copyright (c) 2021-2025 Datalayer, Inc.
 *
 * MIT License
 */

/**
 * The Datalayer Chat's entry: the network bridge first, the page after.
 *
 * ESM evaluates a module's imports before its own statements, so a page
 * that installed the bridge in its body ran every static import — and
 * whatever captured `window.fetch` at module-eval time — on the real
 * globals, which the webview's Content Security Policy then blocked. Here
 * nothing but the bridge is imported statically; the page (`./main`) and
 * all it imports arrive by `import()`, once the bridge is in place.
 *
 * @module webview/agentChat/index
 */

import { installNetworkBridge } from "./networkBridge";
import { vscode } from "./vscodeApi";

installNetworkBridge(vscode);

void import("./main");
