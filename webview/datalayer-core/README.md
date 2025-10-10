# ag-ui Notebook Example with CopilotKit

This directory contains a complete example of platform-agnostic tool usage with CopilotKit's AI copilot interface.

## Overview

The example demonstrates:

- **Platform-agnostic tools** - Using `datalayer-react` tools outside of VS Code
- **CopilotKit integration** - AI copilot sidebar for natural language editing
- **Jupyter notebook** - Full notebook editor from `@datalayer/jupyter-react`
- **Tool registration** - Using ag-ui adapter hooks to register tools

## Architecture

```
┌─────────────────────────────────────────────┐
│         CopilotKit Provider                 │
│  (Handles LLM communication)                │
└─────────────────┬───────────────────────────┘
                  │
                  ▼
┌─────────────────────────────────────────────┐
│         CopilotSidebar                      │
│  (AI chat interface)                        │
└─────────────────┬───────────────────────────┘
                  │
                  ▼
┌─────────────────────────────────────────────┐
│    Tool Registration (ag-ui adapter)        │
│  - createAllCopilotKitActions()             │
│  - Converts tool definitions to actions     │
└─────────────────┬───────────────────────────┘
                  │
                  ▼
┌─────────────────────────────────────────────┐
│       Notebook Editor (Jupyter2)            │
│  - Notebook2 component                      │
│  - Cell manipulation                        │
└─────────────────────────────────────────────┘
```

## Files

### `AgUIExample.tsx`

Main component that:

1. **Creates mock document handle** - Provides tool execution context
2. **Registers notebook tools** - Uses ag-ui adapter to create CopilotKit actions
3. **Renders notebook editor** - Full Jupyter notebook UI
4. **Integrates CopilotSidebar** - AI copilot interface

### `index.html`

Entry point HTML file for the example.

## Usage

### Try these prompts with the AI copilot:

- "Insert a code cell with hello world"
- "Delete cell at index 0"
- "Update cell 1 with new content"
- "Read the content of cell 2"
- "Execute cell 0"

### Available Tools

All notebook tools from `datalayer-react` are automatically registered:

- **insertCell** - Insert code/markdown cells
- **deleteCell** - Delete cells by index
- **updateCell** - Update cell source
- **readCell** - Read single cell content
- **executeCell** - Execute code cells

## Running the Example

### Prerequisites

1. Install CopilotKit dependencies (already done):

```bash
npm install @copilotkit/react-core @copilotkit/react-ui
```

2. Configure your API key:

CopilotKit requires an LLM backend. You have several options:

**Option A: Use CopilotKit Cloud (Easiest)**

```typescript
// In AgUIExample.tsx, update the CopilotKit component:
<CopilotKit
  runtimeUrl="https://api.copilotkit.ai"
  publicApiKey="YOUR_COPILOTKIT_API_KEY"
  agent="notebook-agent"
>
```

Get your API key from [CopilotKit Dashboard](https://cloud.copilotkit.ai)

**Option B: Self-hosted Backend**

```typescript
// Run your own backend server (see CopilotKit docs)
<CopilotKit
  runtimeUrl="http://localhost:3000/api/copilotkit"
  agent="notebook-agent"
>
```

**Option C: OpenAI Direct**

```typescript
import { CopilotRuntime, OpenAIAdapter } from "@copilotkit/runtime";

// Configure in your backend
const runtime = new CopilotRuntime();
const adapter = new OpenAIAdapter({
  apiKey: process.env.OPENAI_API_KEY,
});
```

3. For this example, we recommend **Option A** (CopilotKit Cloud) for quick testing

### Development

```bash
# Build the extension
npm run compile

# Open in browser (if using webpack dev server)
npm run start:agui  # (TODO: Add this script)
```

### Production

This example will be extracted to the `@datalayer/jupyter-ui` package as a reference implementation.

## Integration with Other Platforms

The same tool definitions and operations work across:

- **VS Code** - Using `VSCodeToolAdapter`
- **SaaS** - Using `SaaSToolAdapter`
- **ag-ui** - Using `AgUIToolAdapter` (this example)

## Technical Notes

### Mock Document Handle

The example uses a mock document handle that logs operations to the console. In a real implementation, this would:

- Connect to an actual Jupyter kernel
- Manipulate the notebook model via Jupyter API
- Sync changes to persistent storage

### CopilotKit Configuration

The example requires:

- **Backend runtime URL** - `runtimeUrl="/api/copilotkit"`
- **Agent name** - `agent="notebook-agent"`
- **LLM provider** - Configure in backend (OpenAI, Anthropic, etc.)

See [CopilotKit documentation](https://docs.copilotkit.ai/direct-to-llm/guides/quickstart) for setup details.

## Future Enhancements

- [ ] Real Jupyter kernel connection
- [ ] Persistent notebook storage
- [ ] Additional tools (create notebooks, manage runtimes)
- [ ] Custom render functions for tool results
- [ ] Error handling and recovery

---

**Last Updated**: January 2025
