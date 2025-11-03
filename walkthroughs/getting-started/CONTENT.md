# Datalayer Walkthrough Content

This file contains the actual content for the 7 walkthrough steps. This content is implemented in [package.json](../../package.json) under `contributes.walkthroughs`.

---

## Step 1: Login to Datalayer App

**Title**: Login to Datalayer App

**Description**:
Create your Datalayer account to access cloud-powered Jupyter notebooks with GPU support and real-time collaboration.

Visit [datalayer.app](https://datalayer.app/) and login with **GitHub** or **LinkedIn** to get started.

**Image**: [datalayer-app-login.svg](media/datalayer-app-login.svg)

**Alt Text**: Login to Datalayer App with GitHub or LinkedIn

**Buttons**: None (informational step)

**Completion**: Manual

---

## Step 2: Generate Your API Key

**Title**: Generate Your API Key

**Description**:
Your API Key is required to securely connect VS Code to your Datalayer account.

After logging in, go to [Settings > IAM > Tokens](https://datalayer.app/settings/iam/tokens) to create your **API Key**. Keep it secure as you'll use it to authenticate VS Code.

**Image**: [datalayer-iam-tokens.svg](media/datalayer-iam-tokens.svg)

**Alt Text**: Generate API Key in Datalayer Settings

**Buttons**: None (informational step)

**Completion**: Manual

---

## Step 3: Connect VS Code to Datalayer

**Title**: Connect VS Code to Datalayer

**Description**:
Connect VS Code to your Datalayer account to access cloud runtimes, shared workspaces, and collaboration features.

Click the button below and paste your **API Key** when prompted.

**Image**: [datalayer-vscode-login.svg](media/datalayer-vscode-login.svg)

**Alt Text**: Connect VS Code to Datalayer - API Key Input Dialog

**Buttons**:
- [Login to Datalayer](command:datalayer.login)

**Completion**: Auto-completes on successful login (onCommand:datalayer.login)

---

## Step 4: Create Your First Notebook

**Title**: Create Your First Notebook

**Description**:
Jupyter notebooks combine code, visualizations, and documentation in one interactive document. Perfect for data analysis, machine learning, and scientific computing.

**Image**: [datalayer-notebook-editor.svg](media/datalayer-notebook-editor.svg)

**Alt Text**: Jupyter notebook editor with code cells and outputs

**Buttons**:
- [Create Local Notebook](command:datalayer.newLocalDatalayerNotebook)
- [Create Notebook in Space](command:datalayer.newRemoteDatalayerNotebookPrompt)

**Completion**: Auto-completes when user creates any notebook

---

## Step 5: Select a Runtime

**Title**: Select a Runtime

**Description**:
Cloud runtimes provide powerful computational environments with CPU and GPU support. Execute your notebooks on scalable infrastructure without local setup.

**Image**: [datalayer-runtime-selector.svg](media/datalayer-runtime-selector.svg)

**Alt Text**: Kernel source selection dialog with Datalayer Platform option

**Buttons**:
- [Select Runtime](command:datalayer.selectRuntime)

**Completion**: Auto-completes when runtime is selected (onCommand:datalayer.selectRuntime)

---

## Step 6: Explore Datalayer Spaces

**Title**: Explore Datalayer Spaces

**Description**:
Datalayer Spaces are collaborative workspaces where teams can share notebooks, documents, and data. Access your spaces from the Explorer sidebar.

**Image**: [datalayer-spaces-explorer.svg](media/datalayer-spaces-explorer.svg)

**Alt Text**: Datalayer Spaces tree view showing notebooks and lexical documents

**Buttons**:
- [Refresh Spaces](command:datalayer.refreshSpaces)

**Completion**: Auto-completes when Spaces view is opened (onView:datalayerSpaces)

---

## Step 7: Create a Collaborative Document

**Title**: Create a Collaborative Document

**Description**:
Lexical documents are Notion-like rich text editors with real-time collaboration. Perfect for reports, documentation, and team knowledge sharing.

**Image**: [datalayer-lexical-editor.svg](media/datalayer-lexical-editor.svg)

**Alt Text**: Lexical rich text editor with formatting toolbar and document content

**Buttons**:
- [Create Local Lexical Document](command:datalayer.newLocalLexicalDocument)
- [Create Lexical Document in Space](command:datalayer.newRemoteLexicalDocumentPrompt)

**Completion**: Auto-completes when user creates any Lexical document
