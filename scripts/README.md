# Development Scripts

This directory contains scripts for managing local development workflows with the Datalayer VS Code extension.

## Scripts Overview

### sync-core.sh

Syncs the local `@datalayer/core` package from the `../core` directory to the VS Code extension's `node_modules`.

**Usage:**

```bash
# Single sync
./scripts/sync-core.sh

# Watch mode - auto-sync on changes
./scripts/sync-core.sh --watch
```

**What it does:**

1. Builds the core package (`npm run build:lib`)
2. Copies the `lib/` output to `node_modules/@datalayer/core/lib/`
3. In watch mode, monitors TypeScript and Python source files for changes

### sync-jupyter.sh

Syncs local jupyter-ui packages (`@datalayer/jupyter-lexical` and `@datalayer/jupyter-react`) from the `../jupyter-ui` directory.

**Usage:**

```bash
# Single sync
./scripts/sync-jupyter.sh

# Watch mode - auto-sync on changes
./scripts/sync-jupyter.sh --watch
```

**What it does:**

1. Builds `@datalayer/jupyter-lexical` package
2. Builds `@datalayer/jupyter-react` package
3. Copies their `lib/` outputs to respective `node_modules/` directories
4. In watch mode, monitors source files for changes

### create-patches.sh

Creates patch-package patches for all locally modified Datalayer packages. These patches are committed to the repo and automatically applied during `npm install`.

**Usage:**

```bash
./scripts/create-patches.sh
```

**What it does:**

1. Syncs latest changes from core package
2. Syncs latest changes from jupyter-ui packages
3. Generates patches using `patch-package` for:
   - `@datalayer/core`
   - `@datalayer/jupyter-lexical`
   - `@datalayer/jupyter-react`
4. Saves patches to `patches/` directory

**When to use:**

- After making changes to local dependency packages
- Before committing changes that rely on modified dependencies
- To ensure CI/CD and other developers get the same package modifications

### apply-patches.sh

Applies existing patches from the `patches/` directory to `node_modules`.

**Usage:**

```bash
./scripts/apply-patches.sh
```

**Note:** This is automatically run as a postinstall hook after `npm install`.

## Development Workflow

### Quick Development with Local Packages

1. **Start watch mode for automatic syncing:**

   ```bash
   # In one terminal
   ./scripts/sync-core.sh --watch

   # In another terminal (optional)
   ./scripts/sync-jupyter.sh --watch
   ```

2. **Make changes** to the source files in `../core` or `../jupyter-ui`

3. **Changes are automatically synced** to the VS Code extension's `node_modules`

4. **Reload VS Code extension** to test changes (F5 or Run > Start Debugging)

### Creating Patches for Deployment

When you've made changes to local packages that should be deployed:

1. **Ensure all changes are synced:**

   ```bash
   ./scripts/sync-core.sh
   ./scripts/sync-jupyter.sh
   ```

2. **Create patches:**

   ```bash
   ./scripts/create-patches.sh
   ```

3. **Commit the patches:**

   ```bash
   git add patches/
   git commit -m "Update patches for core/jupyter-ui changes"
   ```

4. **The patches will be applied automatically** on `npm install` for other developers and CI/CD

## Requirements

### For Watch Mode

- **fswatch** - Install via Homebrew:
  ```bash
  brew install fswatch
  ```

The scripts will attempt to install fswatch automatically if not found.

### For Creating Patches

- **patch-package** - Installed as a dev dependency via npm

## Directory Structure

```
vscode-datalayer/
├── scripts/
│   ├── README.md           # This file
│   ├── sync-core.sh        # Sync @datalayer/core
│   ├── sync-jupyter.sh     # Sync jupyter-ui packages
│   ├── create-patches.sh   # Create patches for all packages
│   └── apply-patches.sh    # Apply existing patches
├── patches/                # Generated patches (committed to repo)
│   ├── @datalayer+core+...patch
│   ├── @datalayer+jupyter-lexical+...patch
│   └── @datalayer+jupyter-react+...patch
└── node_modules/           # Dependencies (modified by sync scripts)
```

## Troubleshooting

### Sync not working

- Ensure the sibling directories exist: `../core` and `../jupyter-ui`
- Check that the packages build successfully
- Verify you're in the `vscode-datalayer` directory

### Patches not applying

- Run `npm install` to trigger the postinstall hook
- Manually run `./scripts/apply-patches.sh`
- Check `patches/` directory exists and contains `.patch` files

### Watch mode not working

- Install fswatch: `brew install fswatch`
- Check file permissions on the script
- Verify the paths to source directories

## Notes

- Patches are created from the **current state** of `node_modules`, so always sync before creating patches
- Watch mode uses `fswatch` to monitor file changes with 1-second debouncing
- The TypeScript build (`build:lib`) is faster than full build for development iteration
