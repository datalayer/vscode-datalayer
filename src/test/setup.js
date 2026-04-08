/*
 * Copyright (c) 2021-2025 Datalayer, Inc.
 *
 * MIT License
 */

/**
 * Test setup that intercepts require() calls to @datalayer/core and related
 * packages that contain ESM-only or browser-only code (React components,
 * CSS imports, styled-components).
 *
 * The VS Code test runner uses CJS require() but @datalayer/core has
 * "type": "module" and exports React UI components that cannot run in Node.js.
 * This hook prevents Node from trying to ESM-load those modules by providing
 * minimal stubs for the parts the extension code actually uses at runtime.
 */

const Module = require("module");

const INTERCEPTED_PREFIXES = [
  "@datalayer/core",
  "@datalayer/agent-runtimes",
  "@datalayer/icons-react",
  "@datalayer/primer-addons",
  "@datalayer/jupyter-react",
  "@datalayer/jupyter-lexical",
  "@datalayer/lexical-loro",
  "@primer/react",
  "styled-components",
];

// Minimal stubs matching the exports the extension code uses
const ItemTypes = {
  NOTEBOOK: "notebook",
  LEXICAL: "document",
  EXERCISE: "exercise",
  CELL: "cell",
  SPACE: "space",
};

class DatalayerClientStub {
  constructor() {
    this.runtimes = { list: async () => ({ runtimes: [] }) };
    this.iam = { me: async () => ({}) };
    this.spacer = { spaces: { list: async () => ({ spaces: [] }) } };
  }
}

class AuthenticationManagerStub {}

const CLIENT_STUB = {
  DatalayerClient: DatalayerClientStub,
  AuthenticationManager: AuthenticationManagerStub,
  ItemTypes,
};

// Stub for zodToToolParameters from @datalayer/jupyter-react
function zodToToolParameters(schema) {
  return { type: "object", properties: {} };
}

// AgentsMixin stub: identity function that returns the base class unchanged
function AgentsMixinStub(Base) {
  return Base;
}

const STUBS = {
  "@datalayer/core/lib/client": CLIENT_STUB,
  "@datalayer/core/lib/client/constants": { ItemTypes },
  "@datalayer/core/lib/api/iam/oauth2": { getOAuth2AuthzUrl: () => "" },
  "@datalayer/jupyter-react": { zodToToolParameters },
  "@datalayer/agent-runtimes/lib/client/AgentsMixin": {
    AgentsMixin: AgentsMixinStub,
  },
};

const originalLoad = Module._load;

Module._load = function (request, parent, isMain) {
  // Check exact match first
  if (STUBS[request]) {
    return STUBS[request];
  }

  // Check prefix match for any intercepted package
  for (const prefix of INTERCEPTED_PREFIXES) {
    if (request === prefix || request.startsWith(prefix + "/")) {
      return {};
    }
  }

  // Stub .py file requires (webpack normally bundles these as strings)
  if (request.endsWith(".py")) {
    return { default: "" };
  }

  return originalLoad.call(this, request, parent, isMain);
};
