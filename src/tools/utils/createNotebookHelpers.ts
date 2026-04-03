/*
 * Copyright (c) 2021-2025 Datalayer, Inc.
 *
 * MIT License
 */

/**
 * Internal Notebook Creation Helpers
 *
 * These are internal helper functions called by the unified createDocument operation.
 * They are NOT exposed directly to the VS Code language model.
 *
 * @module tools/internal/createNotebook
 */

import type { CreateDocumentResult } from "../utils/createDocument";

/**
 * Creates a cloud notebook in a Datalayer space.
 * @param params - Notebook creation parameters (name, description, space, cells).
 * @param params.name - Display name for the notebook.
 * @param params.description - Optional description for the notebook.
 * @param params.spaceName - Name of the target Datalayer space.
 * @param params.spaceId - Optional space identifier for direct lookup.
 * @param params.initialCells - Optional array of initial notebook cells.
 * @param context - Context with Datalayer client, auth, and cloud document callbacks.
 * @param context.datalayer - Datalayer client instance for API calls.
 * @param context.auth - Authentication state for the current user.
 * @param context.extras - Additional callbacks and utilities.
 * @param context.extras.openCloudDocument - Callback to open the created notebook.
 * @param chatMessage - Optional message to include in the result for chat feedback.
 *
 * @returns Result with notebook URI and metadata or error details.
 */
export async function createCloudNotebook(
  params: {
    name: string;
    description?: string;
    spaceName: string;
    spaceId?: string;
    initialCells?: unknown[];
  },
  context: {
    datalayer?: unknown;
    auth?: unknown;
    extras?: {
      openCloudDocument?: (
        document: unknown,
        spaceName: string,
        documentType: "notebook" | "lexical",
      ) => Promise<void>;
    };
  },
  chatMessage?: string,
): Promise<CreateDocumentResult> {
  const { name, description, spaceName, spaceId } = params;
  const { datalayer, auth, extras } = context;

  if (!datalayer) {
    return {
      success: false,
      uri: "",
      error:
        "Datalayer is required for cloud notebook creation. Ensure you're authenticated.",
      chatMessage,
    };
  }

  if (
    !auth ||
    !(auth as { isAuthenticated?: () => boolean }).isAuthenticated?.()
  ) {
    return {
      success: false,
      uri: "",
      error:
        "Authentication is required for cloud notebook creation. Please login to Datalayer first.",
      chatMessage,
    };
  }

  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const client = datalayer as any;
    const finalName = name.endsWith(".ipynb") ? name : `${name}.ipynb`;

    let targetSpaceId = spaceId;

    if (!targetSpaceId) {
      const spaces = await client.getMySpaces();

      if (!spaces || spaces.length === 0) {
        return {
          success: false,
          uri: "",
          error: "No spaces available. Please create a space first.",
          chatMessage,
        };
      }

      // If spaceName is "Library space" (default), find the library space by variant
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let targetSpace: any;

      if (spaceName.toLowerCase().includes("library")) {
        // Find the default/library space (variant === "default")
        targetSpace = spaces.find(
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (s: any) => s.variant === "default",
        );
      } else {
        // Search by name for non-library spaces
        targetSpace = spaces.find(
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (s: any) =>
            s.name?.toLowerCase() === spaceName.toLowerCase() ||
            s.name?.toLowerCase().includes(spaceName.toLowerCase()),
        );
      }

      if (!targetSpace) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const availableSpaces = spaces.map((s: any) => s.name).join(", ");
        return {
          success: false,
          uri: "",
          error: `Space "${spaceName}" not found. Available spaces: ${availableSpaces}`,
          chatMessage,
        };
      }

      targetSpaceId = targetSpace.uid;
    }

    const notebook = await client.createNotebook(
      targetSpaceId,
      finalName,
      description || "",
    );

    if (!notebook) {
      return {
        success: false,
        uri: "",
        error: "Failed to create notebook (Datalayer returned null)",
        chatMessage,
      };
    }

    // Get the space to include its name in the URI
    const spaces = await client.getMySpaces();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const space = spaces.find((s: any) => s.uid === targetSpaceId);
    const spaceDisplayName = space?.name || "Unknown Space";

    // URI format: datalayer://{spaceName}/{documentId}/{filename}
    // Encode path components to handle spaces and special characters
    const uri = `datalayer://${encodeURIComponent(spaceDisplayName)}/${encodeURIComponent(notebook.uid)}/${encodeURIComponent(finalName)}`;

    // Call the callback to download and open the notebook
    // Pass the actual Datalayer model instance (same as space tree command)
    if (extras?.openCloudDocument) {
      try {
        await extras.openCloudDocument(notebook, spaceDisplayName, "notebook");
      } catch (error) {
        console.error("Failed to auto-open cloud notebook:", error);
        // Don't fail the creation if auto-open fails
      }
    }

    return {
      success: true,
      notebookId: notebook.uid,
      documentId: notebook.uid,
      uri,
      spaceName: spaceDisplayName,
      chatMessage,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    return {
      success: false,
      uri: "",
      error: `Failed to create cloud notebook: ${errorMessage}`,
      chatMessage,
    };
  }
}

/**
 * Creates a local notebook file on disk with optional initial cells.
 * @param params - Parameters containing the notebook name and optional initial cells.
 * @param params.name - File name for the local notebook.
 * @param params.initialCells - Optional array of initial notebook cells.
 * @param context - Context with extras containing createLocalFile callback.
 * @param context.extras - Additional callbacks including local file creation.
 * @param chatMessage - Optional message to include in the result for chat feedback.
 *
 * @returns Result with file URI or error details.
 */
export async function createLocalNotebook(
  params: { name: string; initialCells?: unknown[] },
  context: { extras?: unknown },
  chatMessage?: string,
): Promise<CreateDocumentResult> {
  const { name, initialCells } = params;
  const { extras } = context;

  try {
    const finalName = name.endsWith(".ipynb") ? name : `${name}.ipynb`;

    const extrasWithFile = extras as {
      createLocalFile?: (filename: string, content: unknown) => Promise<string>;
    };
    const createFile = extrasWithFile?.createLocalFile;

    if (!createFile) {
      throw new Error(
        "createLocalFile callback is required in extras for local notebook creation",
      );
    }

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

    const uri = await createFile(finalName, emptyNotebook);

    return {
      success: true,
      uri,
      chatMessage,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    return {
      success: false,
      uri: "",
      error: `Failed to create local notebook: ${errorMessage}`,
      chatMessage,
    };
  }
}
