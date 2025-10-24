/*
 * Copyright (c) 2021-2025 Datalayer, Inc.
 *
 * MIT License
 */

/**
 * Create Lexical Document Operations - Platform Agnostic
 *
 * @module tools/core/operations/createLexical
 */

import type { ToolOperation, ToolExecutionContext } from "../interfaces";
import type {
  LexicalCreationParams,
  LexicalCreationResult,
} from "../types";

/**
 * Create Remote Lexical Operation
 *
 * Creates a new Lexical document in a Datalayer cloud space.
 * Requires authentication and SDK access in the execution context.
 *
 * @example
 * ```typescript
 * const result = await createRemoteLexicalOperation.execute(
 *   {
 *     name: 'notes.lexical',
 *     description: 'Meeting notes',
 *     spaceName: 'Personal'
 *   },
 *   { sdk, auth }
 * );
 * console.log(`Created lexical document: ${result.uri}`);
 * ```
 */
export const createRemoteLexicalOperation: ToolOperation<
  LexicalCreationParams,
  LexicalCreationResult
> = {
  name: "createRemoteLexical",
  description: "Creates a new Lexical document in a Datalayer cloud space",

  async execute(params, context): Promise<LexicalCreationResult> {
    const { name, description, spaceName, spaceId } = params;
    const { sdk, auth } = context;

    // Validate context
    if (!sdk) {
      throw new Error(
        "SDK is required for createRemoteLexical operation. " +
          "Ensure the tool execution context includes a valid DatalayerClient.",
      );
    }

    if (!auth || !(auth as any).isAuthenticated?.()) {
      throw new Error(
        "Authentication is required for createRemoteLexical operation. " +
          "Please login to Datalayer first.",
      );
    }

    try {
      // Type assertion to access SDK methods
      const client = sdk as any;

      // Ensure lexical name has .lexical extension
      const finalName = name.endsWith(".lexical") ? name : `${name}.lexical`;

      // Find or use specified space
      let targetSpaceId = spaceId;

      if (!targetSpaceId) {
        const spaces = await client.getMySpaces();

        if (!spaces || spaces.length === 0) {
          return {
            success: false,
            uri: "",
            error: "No spaces available. Please create a space first.",
          };
        }

        const targetSpaceName = spaceName || "Personal";
        const targetSpace = spaces.find(
          (s: any) =>
            s.name?.toLowerCase() === targetSpaceName.toLowerCase() ||
            s.name?.toLowerCase().includes(targetSpaceName.toLowerCase()),
        );

        if (!targetSpace) {
          const availableSpaces = spaces.map((s: any) => s.name).join(", ");
          return {
            success: false,
            uri: "",
            error:
              `Space "${targetSpaceName}" not found. Available spaces: ${availableSpaces}`,
          };
        }

        targetSpaceId = targetSpace.uid;
      }

      // Create lexical document via SDK
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
        };
      }

      // Construct Datalayer URI
      const uri = `datalayer:/${targetSpaceId}/${finalName}`;

      return {
        success: true,
        documentId: lexical.uid,
        uri,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      return {
        success: false,
        uri: "",
        error: `Failed to create remote lexical: ${errorMessage}`,
      };
    }
  },
};

/**
 * Create Local Lexical Operation
 *
 * Creates a new Lexical document on the local filesystem.
 *
 * @example
 * ```typescript
 * const result = await createLocalLexicalOperation.execute(
 *   { name: 'notes.lexical' },
 *   { extras: { workspaceFolder: '/path/to/workspace' } }
 * );
 * console.log(`Created local lexical: ${result.uri}`);
 * ```
 */
export const createLocalLexicalOperation: ToolOperation<
  LexicalCreationParams,
  LexicalCreationResult
> = {
  name: "createLocalLexical",
  description: "Creates a new Lexical document on the local filesystem",

  async execute(params, context): Promise<LexicalCreationResult> {
    const { name } = params;
    const { extras } = context;

    try {
      // Ensure name has .lexical extension
      const finalName = name.endsWith(".lexical") ? name : `${name}.lexical`;

      // Platform-specific file creation via extras callback
      const createFile = (extras as any)?.createLocalFile;

      if (!createFile) {
        throw new Error(
          "createLocalFile callback is required in extras for local lexical creation",
        );
      }

      // Create empty lexical document structure
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

      // Call platform-specific file creation
      const uri = await createFile(finalName, emptyLexical);

      return {
        success: true,
        uri,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      return {
        success: false,
        uri: "",
        error: `Failed to create local lexical: ${errorMessage}`,
      };
    }
  },
};
