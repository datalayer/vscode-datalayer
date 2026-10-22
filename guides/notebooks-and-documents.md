# Notebooks, documents and runtimes

## Editors

**Jupyter notebooks** (`.ipynb`): full notebook editing, run on Datalayer cloud CPUs or GPUs, local Python kernels (direct ZMQ, no Jupyter server needed) or remote Jupyter servers, switched from the kernel picker.

**Datalayer documents** (`.dlex`): a rich-text editor with real-time collaboration, for reports mixing text, images, tables, equations and executable code blocks.

Both follow your VS Code theme.

## The Datalayer sidebar

- **Home** (**Datalayer: Home**, or _Open Datalayer_ at the top of the sidebar): your sessions, agents, spaces, outline and settings as one page.
- **Spaces**: your cloud notebooks and documents, as `datalayer://Space Name/document.ipynb`. Create, rename and delete them in place; shared spaces included.
- **Agents**: your runtimes and their agents. Create and terminate runtimes; each shows its environment (CPU or GPU, memory), its time left and its health.
- **Outline**: the headings of the open document.
- **Settings**: **Datasources** (Athena, BigQuery, Microsoft Sentinel, Splunk: create, edit from the row or its menu) and **Secrets** (the credentials datasources use).

## Runtimes

- **Auto-connect**: a document connects to an available runtime when it opens (`datalayer.autoConnect.strategies`).
- **On demand**: create a runtime from the kernel picker when you need one.
- **Reuse**: an existing healthy runtime is reused, to save credits.
- **Duration**: 1 to 1,440 minutes (`datalayer.runtime.defaultMinutes`).

Runtimes use credits while they run.

## Questions

**Do I need Python locally?** No. Cloud runtimes run everything. You can still use a local Python or Jupyter environment.

**Can I use it without a Datalayer account?** Yes, for local `.ipynb` files and your own Python or Jupyter environments. Cloud runtimes, spaces, agents and sessions need an account.

**Can I edit cloud documents?** Yes: create, edit and collaborate on notebooks and documents in your spaces.

**GitHub Copilot?** The extension gives Copilot tools to create notebooks and insert cells, for example _"Create a local notebook and add a plot"_.
