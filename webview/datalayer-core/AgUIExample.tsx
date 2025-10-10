/*
 * Copyright (c) 2021-2025 Datalayer, Inc.
 *
 * MIT License
 */

/**
 * ag-ui Example with CopilotKit Integration
 *
 * @module datalayer-core/AgUIExample
 */

import React from "react";
import { createRoot } from "react-dom/client";
import { Box } from "@datalayer/primer-addons";
import {
  Notebook2,
  useJupyter,
  JupyterReactTheme,
} from "@datalayer/jupyter-react";

// CopilotKit imports
import { CopilotKit, useCopilotAction } from "@copilotkit/react-core";
import { CopilotSidebar } from "@copilotkit/react-ui";
import "@copilotkit/react-ui/styles.css";

// Import ag-ui components and hooks
import {
  CopilotActionsProvider,
  useNotebookToolActions,
} from "../../src/datalayer-core/tools/adapters/agui/hooks";

// Fixed notebook ID
const NOTEBOOK_ID = "agui-notebook-example";

/**
 * Notebook UI component (without tool registration)
 */
function NotebookUI(): JSX.Element {
  const { serviceManager } = useJupyter();

  if (!serviceManager) {
    return (
      <Box sx={{ padding: 3 }}>
        <p>Loading Jupyter service manager...</p>
      </Box>
    );
  }

  return (
    <Box
      sx={{
        height: "100vh",
        width: "100vw",
        display: "flex",
        overflow: "hidden",
      }}
    >
      <Box
        sx={{
          flex: 1,
          display: "flex",
          flexDirection: "column",
          overflow: "auto",
          padding: 3,
        }}
      >
        <Box
          sx={{
            marginBottom: 3,
            paddingBottom: 3,
            borderBottom: "1px solid",
            borderColor: "border.default",
          }}
        >
          <h1>ag-ui Notebook Example</h1>
          <p>Platform-agnostic tool usage with CopilotKit integration.</p>
        </Box>

        <Box
          sx={{
            border: "1px solid",
            borderColor: "border.default",
            borderRadius: 2,
            padding: 3,
            backgroundColor: "canvas.default",
          }}
        >
          <Notebook2
            nbformat={{
              metadata: {},
              nbformat: 4,
              nbformat_minor: 5,
              cells: [
                {
                  cell_type: "code",
                  execution_count: null,
                  metadata: {},
                  outputs: [],
                  source:
                    "# Welcome to ag-ui Notebook Example\nprint('Hello from Datalayer!')",
                },
                {
                  cell_type: "markdown",
                  metadata: {},
                  source:
                    "## AI-Powered Notebook Editing\n\nUse the copilot sidebar.",
                },
              ],
            }}
            id={NOTEBOOK_ID}
            serviceManager={serviceManager}
            height="600px"
            cellSidebarMargin={120}
            startDefaultKernel={false}
          />
        </Box>
      </Box>
    </Box>
  );
}

/**
 * Main ag-ui example component with tool registration
 * IMPORTANT: This must be inside CopilotKit context
 */
function AgUIExample(): JSX.Element {
  // Create notebook tool actions
  const actions = useNotebookToolActions(NOTEBOOK_ID);

  return (
    <CopilotActionsProvider
      actions={actions}
      useCopilotAction={useCopilotAction}
    >
      <NotebookUI />
    </CopilotActionsProvider>
  );
}

/**
 * Root component with CopilotKit provider
 */
function App(): JSX.Element {
  return (
    <JupyterReactTheme colormode="light" loadJupyterLabCss={true}>
      <CopilotKit
        showDevConsole={true}
        publicApiKey="ck_pub_9a447867a3c0843233217d2eb88e6611"
      >
        <CopilotSidebar
          defaultOpen={true}
          labels={{
            title: "Notebook AI Copilot",
            initial: "Hi! I can help you edit notebook cells.",
          }}
        >
          <AgUIExample />
        </CopilotSidebar>
      </CopilotKit>
    </JupyterReactTheme>
  );
}

// Mount the app
const container = document.getElementById("root");
if (container) {
  const root = createRoot(container);
  root.render(<App />);
} else {
  console.error("Root container not found!");
}

export default App;
