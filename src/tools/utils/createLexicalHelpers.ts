/*
 * Copyright (c) 2021-2025 Datalayer, Inc.
 *
 * MIT License
 */

/**
 * Internal Lexical Creation Helpers
 *
 * These are internal helper functions called by the unified createDocument operation.
 * They are NOT exposed directly to the VS Code language model.
 *
 * @module tools/internal/createLexical
 */

import type { CreateDocumentResult } from "../utils/createDocument";

/**
 * Resolves a space ID from a space name using the Datalayer client.
 * @param client - The Datalayer client used to query available spaces.
 * @param spaceName - The name of the target space to look up.
 * @param chatMessage - User-facing message included in error results on failure.
 *
 * @returns Object with spaceId on success, or a CreateDocumentResult error.
 */
async function resolveSpaceId(
  client: unknown,
  spaceName: string,
  chatMessage?: string,
): Promise<{ spaceId: string } | CreateDocumentResult> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const spaces = await (client as any).getMySpaces();

  if (!spaces || spaces.length === 0) {
    return {
      success: false,
      uri: "",
      error: "No spaces available. Please create a space first.",
      chatMessage,
    };
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let targetSpace: any;

  if (spaceName.toLowerCase().includes("library")) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    targetSpace = spaces.find((s: any) => s.variant === "default");
  } else {
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

  return { spaceId: targetSpace.uid };
}

/**
 * Creates a cloud lexical document in a Datalayer space.
 * @param params - Lexical document creation parameters (name, description, space).
 * @param params.name - Display name for the lexical document.
 * @param params.description - Optional description for the document.
 * @param params.spaceName - Name of the target Datalayer space.
 * @param params.spaceId - Optional space identifier for direct lookup.
 * @param context - Context with Datalayer client, auth, and cloud document callbacks.
 * @param context.datalayer - Datalayer client instance for API calls.
 * @param context.auth - Authentication state for the current user.
 * @param context.extras - Additional callbacks and utilities.
 * @param context.extras.openCloudDocument - Callback to open the created document.
 * @param chatMessage - Optional message to include in the result for chat feedback.
 *
 * @returns Result with document URI and metadata or error details.
 */
export async function createCloudLexical(
  params: {
    name: string;
    description?: string;
    spaceName: string;
    spaceId?: string;
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
        "Datalayer is required for cloud lexical creation. Ensure you're authenticated.",
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
        "Authentication is required for cloud lexical creation. Please login to Datalayer first.",
      chatMessage,
    };
  }

  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const client = datalayer as any;
    // Support both .dlex (new) and .lexical (legacy) but always create new files as .dlex
    const finalName =
      name.endsWith(".dlex") || name.endsWith(".lexical")
        ? name
        : `${name}.dlex`;

    let targetSpaceId = spaceId;

    if (!targetSpaceId) {
      const resolveResult = await resolveSpaceId(
        client,
        spaceName,
        chatMessage,
      );
      if ("success" in resolveResult) {
        return resolveResult as CreateDocumentResult;
      }
      targetSpaceId = resolveResult.spaceId;
    }

    const lexical = await client.createLexical(
      targetSpaceId,
      finalName,
      description || "",
    );

    if (!lexical) {
      return {
        success: false,
        uri: "",
        error: "Failed to create lexical document (Datalayer returned null)",
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
    const uri = `datalayer://${encodeURIComponent(spaceDisplayName)}/${encodeURIComponent(lexical.uid)}/${encodeURIComponent(finalName)}`;

    // Call the callback to download and open the lexical document
    // Pass the actual Datalayer model instance (same as space tree command)
    if (extras?.openCloudDocument) {
      try {
        await extras.openCloudDocument(lexical, spaceDisplayName, "lexical");
      } catch (error) {
        console.error("Failed to auto-open cloud lexical:", error);
        // Don't fail the creation if auto-open fails
      }
    }

    return {
      success: true,
      documentId: lexical.uid,
      uri,
      spaceName: spaceDisplayName,
      chatMessage,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    return {
      success: false,
      uri: "",
      error: `Failed to create cloud lexical: ${errorMessage}`,
      chatMessage,
    };
  }
}

/**
 * Creates a local lexical document file on disk with empty content.
 * @param params - Parameters containing the document name.
 * @param params.name - File name for the local lexical document.
 * @param context - Context with extras containing createLocalFile callback.
 * @param context.extras - Additional callbacks including local file creation.
 * @param chatMessage - Optional message to include in the result for chat feedback.
 *
 * @returns Result with file URI or error details.
 */
export async function createLocalLexical(
  params: { name: string },
  context: { extras?: unknown },
  chatMessage?: string,
): Promise<CreateDocumentResult> {
  const { name } = params;
  const { extras } = context;

  try {
    // Support both .dlex (new) and .lexical (legacy) but always create new files as .dlex
    const finalName =
      name.endsWith(".dlex") || name.endsWith(".lexical")
        ? name
        : `${name}.dlex`;

    const extrasWithFile = extras as {
      createLocalFile?: (filename: string, content: unknown) => Promise<string>;
    };
    const createFile = extrasWithFile?.createLocalFile;

    if (!createFile) {
      throw new Error(
        "createLocalFile callback is required in extras for local lexical creation",
      );
    }

    const emptyLexical = {
      root: {
        children: [],
        direction: null,
        format: "",
        indent: 0,
        type: "root",
        version: 1,
      },
    };

    const uri = await createFile(finalName, emptyLexical);

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
      error: `Failed to create local lexical: ${errorMessage}`,
      chatMessage,
    };
  }
}
