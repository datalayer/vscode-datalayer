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
 * Creates a cloud lexical document in Datalayer space
 */
export async function createCloudLexical(
  params: {
    name: string;
    description?: string;
    spaceName: string;
    spaceId?: string;
  },
  context: {
    sdk?: unknown;
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
  const { sdk, auth, extras } = context;

  if (!sdk) {
    return {
      success: false,
      uri: "",
      error:
        "SDK is required for cloud lexical creation. Ensure you're authenticated.",
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
    const client = sdk as any;
    // Support both .dlex (new) and .lexical (legacy) but always create new files as .dlex
    const finalName =
      name.endsWith(".dlex") || name.endsWith(".lexical")
        ? name
        : `${name}.dlex`;

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

    const lexical = await client.createLexical(
      targetSpaceId,
      finalName,
      description || "",
    );

    if (!lexical) {
      return {
        success: false,
        uri: "",
        error: "Failed to create lexical document (SDK returned null)",
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
    // Pass the actual SDK model instance (same as space tree command)
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
 * Creates a local lexical document file
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
