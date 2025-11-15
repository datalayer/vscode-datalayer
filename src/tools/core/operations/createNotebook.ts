/*
 * Copyright (c) 2021-2025 Datalayer, Inc.
 *
 * MIT License
 */

/**
 * Create Notebook Operations - Platform Agnostic
 *
 * @module tools/core/operations/createNotebook
 */

import type { ToolOperation } from "../interfaces";
import type { NotebookCreationParams, NotebookCreationResult } from "../types";

/**
 * Create Remote Notebook Operation
 *
 * Creates a new Jupyter notebook in a Datalayer cloud space.
 * Requires authentication and SDK access in the execution context.
 *
 * @example
 * ```typescript
 * const result = await createRemoteNotebookOperation.execute(
 *   {
 *     name: 'analysis.ipynb',
 *     description: 'Data analysis notebook',
 *     spaceName: 'Personal'
 *   },
 *   { sdk, auth }
 * );
 * console.log(`Created notebook: ${result.uri}`);
 * ```
 */
export const createRemoteNotebookOperation: ToolOperation<
  NotebookCreationParams,
  NotebookCreationResult
> = {
  name: "createRemoteNotebook",
  description: "Creates a new Jupyter notebook in a Datalayer cloud space",

  async execute(params, context): Promise<NotebookCreationResult> {
    const { name, description, spaceName, spaceId } = params;
    const { sdk, auth } = context;

    // Validate context
    if (!sdk) {
      throw new Error(
        "SDK is required for createRemoteNotebook operation. " +
          "Ensure the tool execution context includes a valid DatalayerClient.",
      );
    }

    if (
      !auth ||
      !(auth as { isAuthenticated?: () => boolean }).isAuthenticated?.()
    ) {
      throw new Error(
        "Authentication is required for createRemoteNotebook operation. " +
          "Please login to Datalayer first.",
      );
    }

    try {
      // Type assertion to access SDK methods (avoid circular import)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const client = sdk as any;

      // Ensure notebook name has .ipynb extension
      const finalName = name.endsWith(".ipynb") ? name : `${name}.ipynb`;

      // Find or use specified space
      let targetSpaceId = spaceId;

      if (!targetSpaceId) {
        // Need to find space by name
        const spaces = await client.getMySpaces();

        if (!spaces || spaces.length === 0) {
          return {
            success: false,
            uri: "",
            error: "No spaces available. Please create a space first.",
          };
        }

        // Find space by name or use Personal/first space as default
        const targetSpaceName = spaceName || "Personal";
        const targetSpace = spaces.find(
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (s: any) =>
            s.name?.toLowerCase() === targetSpaceName.toLowerCase() ||
            s.name?.toLowerCase().includes(targetSpaceName.toLowerCase()),
        );

        if (!targetSpace) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const availableSpaces = spaces.map((s: any) => s.name).join(", ");
          return {
            success: false,
            uri: "",
            error: `Space "${targetSpaceName}" not found. Available spaces: ${availableSpaces}`,
          };
        }

        targetSpaceId = targetSpace.uid;
      }

      // Create notebook via SDK
      const notebook = await client.createNotebook(
        targetSpaceId,
        finalName,
        description || "",
      );

      if (!notebook) {
        return {
          success: false,
          uri: "",
          error: "Failed to create notebook (SDK returned null)",
        };
      }

      // Construct Datalayer URI
      const uri = `datalayer:/${targetSpaceId}/${finalName}`;

      return {
        success: true,
        notebookId: notebook.uid,
        uri,
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      return {
        success: false,
        uri: "",
        error: `Failed to create remote notebook: ${errorMessage}`,
      };
    }
  },
};

/**
 * Create Local Notebook Operation
 *
 * Creates a new Jupyter notebook on the local filesystem.
 * Platform-specific implementation handles file creation.
 *
 * @example
 * ```typescript
 * const result = await createLocalNotebookOperation.execute(
 *   { name: 'analysis.ipynb' },
 *   { extras: { workspaceFolder: '/path/to/workspace' } }
 * );
 * console.log(`Created local notebook: ${result.uri}`);
 * ```
 */
export const createLocalNotebookOperation: ToolOperation<
  NotebookCreationParams,
  NotebookCreationResult
> = {
  name: "createLocalNotebook",
  description: "Creates a new Jupyter notebook on the local filesystem",

  async execute(params, context): Promise<NotebookCreationResult> {
    const { name, initialCells } = params;
    const { extras } = context;

    try {
      // Ensure notebook name has .ipynb extension
      const finalName = name.endsWith(".ipynb") ? name : `${name}.ipynb`;

      // Platform-specific file creation is handled by the adapter
      // via extras.createLocalFile or similar callback
      const extrasWithFile = extras as {
        createLocalFile?: (
          filename: string,
          content: unknown,
        ) => Promise<string>;
      };
      const createFile = extrasWithFile?.createLocalFile;

      if (!createFile) {
        throw new Error(
          "createLocalFile callback is required in extras for local notebook creation",
        );
      }

      // Create empty notebook structure
      const emptyNotebook = {
        cells: initialCells || [],
        metadata: {
          kernelspec: {
            name: "python3",
            display_name: "Python 3",
            language: "python",
          },
          language_info: {
            name: "python",
            version: "3.x",
            mimetype: "text/x-python",
            file_extension: ".py",
          },
        },
        nbformat: 4,
        nbformat_minor: 5,
      };

      // Call platform-specific file creation
      const uri = await createFile(finalName, emptyNotebook);

      return {
        success: true,
        uri,
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      return {
        success: false,
        uri: "",
        error: `Failed to create local notebook: ${errorMessage}`,
      };
    }
  },
};
